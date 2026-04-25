import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import './GraphView.css';

const MAX_NODES = 80;

const LAYOUT_OPTIONS = [
  { value: 'breadthfirst', label: 'Breadth-first' },
  { value: 'cose', label: 'Force (cose)' },
  { value: 'circle', label: 'Circle' },
  { value: 'grid', label: 'Grid' },
];

const NODE_LEGEND = [
  { label: 'Factor', color: '#c9938a' },
  { label: 'Condition', color: '#e57373' },
  { label: 'Intermediate', color: '#f0c07a' },
  { label: 'Outcome', color: '#81c784' },
  { label: 'Patient', color: '#7986cb' },
];

const EDGE_LEGEND = [
  { label: 'Critical path', className: 'graph-legend-edge graph-legend-edge--critical' },
  { label: 'Risk path', className: 'graph-legend-edge graph-legend-edge--risk' },
  { label: 'Both', className: 'graph-legend-edge graph-legend-edge--both' },
];

function normalizeNodes(rawNodes) {
  if (!rawNodes || !rawNodes.length) return [];
  if (typeof rawNodes[0] === 'string') {
    return rawNodes.slice(0, MAX_NODES).map((id) => ({
      id,
      label: 'Unknown',
      name: id,
      color: '#9e9e9e',
      onCriticalPath: false,
      onRiskPath: false,
      patientValue: null,
      patientValueUnit: '',
      impactLevel: '',
      direction: 'neutral',
      confidence: null,
      isTopInfluential: false,
      matchedFeatureKey: null,
    }));
  }
  return rawNodes.slice(0, MAX_NODES).map((n) => ({
    id: n.id,
    label: n.label || 'Unknown',
    name: n.name || n.displayName || n.id,
    color: n.color || '#9e9e9e',
    onCriticalPath: !!n.onCriticalPath,
    onRiskPath: !!n.onRiskPath,
    patientValue: n.patientValue ?? null,
    patientValueUnit: n.patientValueUnit || '',
    impactLevel: n.impactLevel || '',
    direction: n.direction || 'neutral',
    confidence: n.confidence != null ? Number(n.confidence) : null,
    isTopInfluential: !!n.isTopInfluential,
    matchedFeatureKey: n.matchedFeatureKey ?? null,
  }));
}

function directionArrow(direction) {
  if (direction === 'improves') return '↑';
  if (direction === 'reduces') return '↓';
  return '→';
}

function compactNodeName(name = '') {
  const txt = String(name || '').trim();
  if (!txt) return 'Unknown';
  return txt.length > 24 ? `${txt.slice(0, 24)}...` : txt;
}

/** Multi-line Cytoscape label: decision unit summary */
function buildClinicalLabel(n) {
  const name = compactNodeName(n.name || n.id);
  const arrow = directionArrow(n.direction);
  const im = n.impactLevel || '';

  if (n.label === 'Outcome' && name === 'IVF Success') {
    const lines = [name, `${arrow} overall outlook`].filter(Boolean);
    return lines.join('\n');
  }

  if (n.label === 'Patient' || String(n.id).startsWith('Patient:')) {
    return name;
  }

  if (!im) return name;
  const mid = im ? `${arrow} ${im} impact` : `${arrow}`;
  return [name, mid].filter(Boolean).join('\n');
}

function matchNarrativeForNode(meta, explanation) {
  if (!meta || !explanation) return null;
  const key = meta.matchedFeatureKey;
  const token = (meta.name || '').toLowerCase().split(/\s+/)[0] || '';

  const tryList = (items, pole) => {
    for (const item of items || []) {
      if (!item || typeof item !== 'object') continue;
      const blob = `${item.factor || ''} ${item.why_it_matters || ''} ${item.why_it_helps || ''}`.toLowerCase();
      if (key && blob.includes(String(key).replace(/_/g, ' '))) return { ...item, _pole: pole };
      if (token && blob.includes(token)) return { ...item, _pole: pole };
    }
    return null;
  };

  const neg = tryList(explanation.negative_factors, 'neg');
  if (neg) return neg;
  return tryList(explanation.positive_factors, 'pos');
}

function firstNeighborClinicalBasis(nodeId, links) {
  for (const e of links || []) {
    if (e.source === nodeId || e.target === nodeId) {
      if (e.clinical_basis) return e.clinical_basis;
    }
  }
  return '';
}

function applyPathFilter(normalizedNodes, links, pathFilter, criticalPath, explainIds) {
  const cp = criticalPath || [];
  const critEdgeKeys = new Set();
  for (let i = 0; i < cp.length - 1; i += 1) {
    critEdgeKeys.add(`${cp[i]}|${cp[i + 1]}`);
  }

  if (pathFilter === 'critical') {
    const ids = new Set(cp);
    const nodes = normalizedNodes.filter((n) => ids.has(n.id));
    const filteredLinks = links.filter(
      (e) => ids.has(e.source) && ids.has(e.target) && critEdgeKeys.has(`${e.source}|${e.target}`)
    );
    return { nodes, links: filteredLinks };
  }

  if (pathFilter === 'factors') {
    const nodes = normalizedNodes.filter((n) => n.label === 'Factor');
    const idSet = new Set(nodes.map((n) => n.id));
    const filteredLinks = links.filter((e) => idSet.has(e.source) && idSet.has(e.target));
    return { nodes, links: filteredLinks };
  }

  if (pathFilter === 'critical_factors') {
    const nodes = normalizedNodes.filter((n) => n.label === 'Factor' && n.onCriticalPath);
    const idSet = new Set(nodes.map((n) => n.id));
    const filteredLinks = links.filter((e) => idSet.has(e.source) && idSet.has(e.target));
    return { nodes, links: filteredLinks };
  }

  if (pathFilter === 'risk_only') {
    const nodes = normalizedNodes.filter(
      (n) =>
        n.label === 'Outcome' ||
        n.onRiskPath ||
        n.direction === 'reduces' ||
        (n.label === 'Condition' && n.onRiskPath)
    );
    const idSet = new Set(nodes.map((n) => n.id));
    const filteredLinks = links.filter((e) => idSet.has(e.source) && idSet.has(e.target));
    return { nodes, links: filteredLinks };
  }

  if (pathFilter === 'patient') {
    const ids = new Set([...(cp || []), ...(explainIds || [])]);
    const nodes = normalizedNodes.filter((n) => ids.has(n.id));
    const idSet = new Set(nodes.map((n) => n.id));
    const filteredLinks = links.filter((e) => idSet.has(e.source) && idSet.has(e.target));
    return { nodes, links: filteredLinks };
  }

  if (pathFilter === 'explain') {
    const ids = new Set(explainIds || []);
    if (ids.size === 0) return { nodes: normalizedNodes, links };
    const nodes = normalizedNodes.filter((n) => ids.has(n.id));
    const idSet = new Set(nodes.map((n) => n.id));
    const filteredLinks = links.filter((e) => idSet.has(e.source) && idSet.has(e.target));
    return { nodes, links: filteredLinks };
  }

  return { nodes: normalizedNodes, links };
}

function edgeClassForKind(kind) {
  if (kind === 'critical') return 'edge-critical';
  if (kind === 'risk') return 'edge-risk';
  if (kind === 'both') return 'edge-both';
  return 'edge-default';
}

function convertToCytoscape(graphNodes, graphLinks) {
  const nodeIds = new Set(graphNodes.map((n) => n.id));
  const filteredLinks = (graphLinks || []).filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  const nodeMeta = {};
  const nodes = graphNodes.map((n) => {
    nodeMeta[n.id] = n;
    const classes = [];
    if (n.onCriticalPath) classes.push('node-on-critical');
    if (n.onRiskPath) classes.push('node-on-risk');
    if (n.isTopInfluential) classes.push('node-star');
    return {
      data: {
        id: n.id,
        label: buildClinicalLabel(n),
        nodeType: n.label,
        displayName: n.name,
        rawColor: n.color,
        onCriticalPath: n.onCriticalPath,
        onRiskPath: n.onRiskPath,
      },
      classes: classes.filter(Boolean).join(' '),
    };
  });

  const edges = filteredLinks.map((e, idx) => {
    const kind = e.kind || 'risk';
    const w = e.weight != null && !Number.isNaN(Number(e.weight)) ? Number(e.weight) : 0.55;
    return {
      data: {
        id: `e-${idx}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        kind,
        weight: w,
        relationship: e.relationship || '',
        clinical_basis: e.clinical_basis || '',
      },
      classes: edgeClassForKind(kind),
    };
  });

  return { elements: [...nodes, ...edges], nodeMeta, links: filteredLinks };
}

function neighborRows(nodeId, links, nodeMeta) {
  const rows = [];
  (links || []).forEach((e) => {
    if (e.source === nodeId) {
      const other = nodeMeta[e.target];
      rows.push({
        key: `${e.source}->${e.target}-out`,
        direction: 'Out',
        otherId: e.target,
        otherName: other?.name || e.target,
        otherType: other?.label || '',
        relationship: e.relationship || '',
        weight: e.weight,
        kind: e.kind,
      });
    }
    if (e.target === nodeId) {
      const other = nodeMeta[e.source];
      rows.push({
        key: `${e.source}->${e.target}-in`,
        direction: 'In',
        otherId: e.source,
        otherName: other?.name || e.source,
        otherType: other?.label || '',
        relationship: e.relationship || '',
        weight: e.weight,
        kind: e.kind,
      });
    }
  });
  return rows;
}

function findDriverLine(explanation, nodeId, displayName) {
  const buckets = [
    ...(explanation?.key_drivers || []),
    ...(explanation?.positive_factors || []),
    ...(explanation?.negative_factors || []),
  ];
  const needle = (displayName || nodeId || '').toLowerCase();
  const idNeedle = (nodeId || '').toLowerCase();
  for (const item of buckets) {
    const line =
      typeof item === 'string'
        ? item
        : item?.factor || item?.why_it_matters || item?.why_it_helps || item?.text || '';
    if (!line) continue;
    const low = line.toLowerCase();
    if (needle && low.includes(needle)) return line;
    if (idNeedle && low.includes(idNeedle)) return line;
  }
  return null;
}

const GraphView = ({ graphData, criticalPath, explanation }) => {
  const [pathFilter, setPathFilter] = useState('all');
  const [detailMode, setDetailMode] = useState('doctor');
  const [layoutName, setLayoutName] = useState('breadthfirst');
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [hoverTip, setHoverTip] = useState(null);
  const cyRef = useRef(null);
  const layoutTimerRef = useRef(null);

  const rawLinks = graphData?.links || [];
  const explainIds = graphData?.meta?.explainFocusNodeIds || [];
  const graphMeta = graphData?.meta || {};
  const effectivePathFilter = detailMode === 'patient' ? 'patient' : pathFilter;

  const { elements, nodeMeta, links } = useMemo(() => {
    if (!graphData || !Array.isArray(graphData.nodes)) {
      return { elements: [], nodeMeta: {}, links: [] };
    }
    const normalized = normalizeNodes(graphData.nodes);
    const { nodes, links: lf } = applyPathFilter(
      normalized,
      rawLinks,
      effectivePathFilter,
      criticalPath,
      explainIds
    );
    return convertToCytoscape(nodes, lf);
  }, [graphData, rawLinks, effectivePathFilter, criticalPath, explainIds]);

  const layoutConfig = useMemo(() => {
    const base = { animate: false, padding: 48, fit: true, nodeDimensionsIncludeLabels: true };
    if (layoutName === 'breadthfirst') {
      return {
        ...base,
        name: 'breadthfirst',
        directed: true,
        spacingFactor: 2.35,
        avoidOverlap: true,
        avoidOverlapPadding: 18,
      };
    }
    if (layoutName === 'cose') {
      return { ...base, name: 'cose', nodeRepulsion: 7000, idealEdgeLength: 180, randomize: false };
    }
    if (layoutName === 'circle') {
      return { ...base, name: 'circle' };
    }
    return { ...base, name: 'grid', rows: undefined, cols: undefined };
  }, [layoutName]);

  const applyFocusStyles = useCallback((cy, nodeId) => {
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('dim focus');
      if (!nodeId) return;
      const t = cy.getElementById(nodeId);
      if (!t || !t.nonempty()) return;
      const nb = t.closedNeighborhood();
      cy.elements().addClass('dim');
      nb.removeClass('dim');
      nb.addClass('focus');
    });
  }, []);

  const clearFocus = useCallback(() => {
    setSelectedId(null);
    const cy = cyRef.current;
    if (cy) {
      cy.batch(() => cy.elements().removeClass('dim focus'));
    }
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !elements.length) return undefined;

    const onTap = (evt) => {
      if (evt.target === cy) {
        clearFocus();
        return;
      }
      if (typeof evt.target.isNode !== 'function' || !evt.target.isNode()) {
        return;
      }
      const id = evt.target.id();
      setSelectedId(id);
      applyFocusStyles(cy, id);
    };

    const onMouseOver = (evt) => {
      if (typeof evt.target.isNode !== 'function' || !evt.target.isNode()) return;
      const n = evt.target;
      const id = n.id();
      const meta = nodeMeta[id];
      const oe = evt.originalEvent;
      const x = oe?.clientX ?? 0;
      const y = oe?.clientY ?? 0;
      const lines = [
        meta?.name || id,
        meta?.label ? `Type: ${meta.label}` : '',
        meta?.isTopInfluential ? 'Most influential factor (model)' : '',
        meta?.onCriticalPath ? 'On critical path' : '',
        meta?.onRiskPath ? 'On risk path' : '',
      ];
      if (detailMode === 'doctor') {
        if (meta?.impactLevel) lines.push(`${directionArrow(meta.direction)} ${meta.impactLevel} impact`);
        if (meta?.confidence != null) lines.push(`Confidence: ${Number(meta.confidence).toFixed(2)}`);
        if (meta?.patientValue != null && meta?.patientValueUnit)
          lines.push(`Value: ${meta.patientValue} ${meta.patientValueUnit}`);
      }
      setHoverTip({ x, y, text: lines.filter(Boolean).join('\n') });
    };

    const onMouseOut = (evt) => {
      if (evt.target && typeof evt.target.isNode === 'function' && evt.target.isNode()) {
        setHoverTip(null);
      }
    };

    cy.removeAllListeners('tap');
    cy.removeAllListeners('mouseover');
    cy.removeAllListeners('mouseout');
    cy.on('tap', onTap);
    cy.on('mouseover', 'node', onMouseOver);
    cy.on('mouseout', 'node', onMouseOut);

    return () => {
      cy.removeListener('tap', onTap);
      cy.removeListener('mouseover', 'node', onMouseOver);
      cy.removeListener('mouseout', 'node', onMouseOut);
    };
  }, [elements, nodeMeta, clearFocus, applyFocusStyles, detailMode]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !elements.length) return undefined;
    if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
    layoutTimerRef.current = setTimeout(() => {
      try {
        cy.fit(undefined, 32);
      } catch {
        /* ignore */
      }
    }, 80);
    return () => {
      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
    };
  }, [elements, layoutName, effectivePathFilter]);

  useEffect(() => {
    setSelectedId(null);
    const cy = cyRef.current;
    if (cy) cy.elements().removeClass('dim focus');
  }, [effectivePathFilter]);

  const runExplainPrediction = useCallback(() => {
    setDetailMode('doctor');
    setPathFilter('explain');
    setSelectedId(null);
    const cy = cyRef.current;
    if (cy) cy.elements().removeClass('dim focus');
  }, []);

  useEffect(() => {
    if (pathFilter !== 'explain') return undefined;
    const t = setTimeout(() => {
      try {
        cyRef.current?.fit(undefined, 36);
      } catch {
        /* ignore */
      }
    }, 160);
    return () => clearTimeout(t);
  }, [pathFilter, elements]);

  const cyHandler = useCallback(
    (cy) => {
      cyRef.current = cy;
    },
    []
  );

  const zoomBy = (factor) => {
    const cy = cyRef.current;
    if (!cy) return;
    const z = cy.zoom();
    cy.zoom({ level: z * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  };

  const fitGraph = () => {
    const cy = cyRef.current;
    if (cy) cy.fit(undefined, 32);
  };

  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    return <div className="graph-view-empty">Graph will appear after prediction</div>;
  }

  const selectedMeta = selectedId ? nodeMeta[selectedId] : null;
  const driverLine =
    selectedMeta && findDriverLine(explanation, selectedId, selectedMeta.name);
  const narrative = selectedMeta ? matchNarrativeForNode(selectedMeta, explanation) : null;
  const clinicalLink = selectedId ? firstNeighborClinicalBasis(selectedId, links) : '';
  const neighbors = selectedId ? neighborRows(selectedId, links, nodeMeta) : [];
  const probPct = graphMeta.predictionProbability != null
    ? Math.round(Number(graphMeta.predictionProbability) * 100)
    : null;

  const stylesheet = [
    {
      selector: 'node',
      style: {
        'background-color': 'data(rawColor)',
        label: 'data(label)',
        'font-size': '11px',
        'text-wrap': 'wrap',
        'text-max-width': '122px',
        'text-valign': 'center',
        'text-halign': 'center',
        'text-justification': 'center',
        color: '#0b1725',
        'font-weight': 700,
        'line-height': 1.15,
        'min-zoomed-font-size': 9,
        'text-outline-width': 0,
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.96,
        'text-background-shape': 'roundrectangle',
        'text-background-padding': '3px',
        width: 150,
        height: 64,
        padding: '8px',
        shape: 'round-rectangle',
        'shadow-color': 'rgba(20, 184, 166, 0.35)',
        'shadow-blur': 12,
        'shadow-opacity': 0.55,
        'shadow-offset-x': 0,
        'shadow-offset-y': 0,
      },
    },
    {
      selector: 'node.node-on-critical',
      style: {
        'border-width': 2,
        'border-color': '#00A99D',
        'border-opacity': 1,
      },
    },
    {
      selector: 'node.node-on-risk',
      style: {
        'border-width': 1,
        'border-color': 'rgba(180, 35, 24, 0.7)',
      },
    },
    {
      selector: 'node.node-star',
      style: {
        'border-width': 3,
        'border-color': '#f5d76e',
        'border-opacity': 1,
        'text-outline-width': 2,
        'text-outline-color': '#0a1a2e',
      },
    },
    {
      selector: 'node.dim',
      style: { opacity: 0.22 },
    },
    {
      selector: 'node.focus',
      style: { opacity: 1, 'z-index': 999 },
    },
    {
      selector: 'edge',
      style: {
        width: 'mapData(weight, 0.35, 1, 1.5, 6)',
        'line-color': '#7a8a99',
        'target-arrow-color': '#7a8a99',
        'target-arrow-shape': 'triangle',
        'curve-style': 'unbundled-bezier',
        'arrow-scale': 1.1,
        opacity: 0.88,
      },
    },
    { selector: 'edge.edge-risk', style: { 'line-color': '#B42318', 'target-arrow-color': '#B42318' } },
    { selector: 'edge.edge-critical', style: { 'line-color': '#00A99D', 'target-arrow-color': '#00A99D' } },
    {
      selector: 'edge.edge-both',
      style: { 'line-color': '#6B4EE6', 'target-arrow-color': '#6B4EE6' },
    },
    { selector: 'edge.dim', style: { opacity: 0.12 } },
    { selector: 'edge.focus', style: { opacity: 1, 'z-index': 999 } },
  ];

  return (
    <div className={`graph-view-wrap ${expanded ? 'graph-view-wrap--expanded' : ''}`}>
      <div className="graph-view-header">
        <h2>Knowledge Graph</h2>
        <button
          type="button"
          className="graph-view-expand"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          {expanded ? 'Shrink' : 'Expand'}
        </button>
      </div>

      <div className="graph-view-toolbar">
        <div className="graph-view-field graph-view-field--audience" role="group" aria-label="Audience">
          <span>Audience</span>
          <div className="graph-view-segment">
            <button
              type="button"
              className={detailMode === 'doctor' ? 'is-active' : ''}
              onClick={() => setDetailMode('doctor')}
            >
              Doctor
            </button>
            <button
              type="button"
              className={detailMode === 'patient' ? 'is-active' : ''}
              onClick={() => setDetailMode('patient')}
            >
              Patient
            </button>
          </div>
        </div>
        <label className="graph-view-field">
          <span>View</span>
          <select
            value={detailMode === 'patient' ? 'patient' : pathFilter}
            disabled={detailMode === 'patient'}
            onChange={(e) => setPathFilter(e.target.value)}
          >
            <option value="all">All paths</option>
            <option value="critical">Critical path only</option>
            <option value="factors">Factors only</option>
            <option value="critical_factors">Critical path factors</option>
            <option value="risk_only">Risk-focused</option>
            <option value="explain">Explain prediction (top drivers)</option>
            <option value="patient">Patient story (simplified)</option>
          </select>
        </label>
        <label className="graph-view-field">
          <span>Layout</span>
          <select value={layoutName} onChange={(e) => setLayoutName(e.target.value)}>
            {LAYOUT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="graph-view-actions">
          <button
            type="button"
            className="graph-view-actions-primary"
            onClick={runExplainPrediction}
            disabled={detailMode === 'patient' || !explainIds.length}
            title={
              detailMode === 'patient'
                ? 'Switch to Doctor audience to explore drivers'
                : !explainIds.length
                  ? 'Run a prediction to load driver nodes'
                  : 'Show top risk and protective factors for this case'
            }
          >
            {probPct != null ? `Why ~${probPct}% success?` : 'Explain prediction'}
          </button>
          <button type="button" onClick={fitGraph}>
            Fit
          </button>
          <button type="button" onClick={() => zoomBy(1.2)}>
            Zoom +
          </button>
          <button type="button" onClick={() => zoomBy(1 / 1.2)}>
            Zoom −
          </button>
          <button type="button" onClick={clearFocus} disabled={!selectedId}>
            Clear focus
          </button>
        </div>
      </div>

      <div className="graph-view-main">
        <div className="graph-view-canvas-wrap">
          {hoverTip && (
            <div
              className="graph-tooltip"
              style={{ left: hoverTip.x + 12, top: hoverTip.y + 12 }}
              role="tooltip"
            >
              {hoverTip.text.split('\n').map((line, i) => (
                <div key={`${i}-${line}`}>{line}</div>
              ))}
            </div>
          )}
          <CytoscapeComponent
            elements={elements}
            className="graph-view-cy"
            style={{ width: '100%', height: expanded ? 700 : 560 }}
            layout={layoutConfig}
            stylesheet={stylesheet}
            cy={cyHandler}
            minZoom={0.15}
            maxZoom={2.5}
            wheelSensitivity={0.35}
          />
        </div>

        <aside className="graph-view-side">
          <div className="graph-legend">
            <div className="graph-legend-title">Nodes</div>
            <ul className="graph-legend-list">
              {NODE_LEGEND.map((row) => (
                <li key={row.label}>
                  <span className="graph-legend-swatch" style={{ background: row.color }} />
                  {row.label}
                </li>
              ))}
            </ul>
            <div className="graph-legend-title">Edges</div>
            <ul className="graph-legend-list graph-legend-list--edges">
              {EDGE_LEGEND.map((row) => (
                <li key={row.label}>
                  <span className={row.className} />
                  {row.label}
                </li>
              ))}
            </ul>
            <p className="graph-legend-note">Gold border: most influential factor (PageRank in subgraph).</p>
          </div>

          <div className="graph-detail">
            <div className="graph-detail-title">Selected node</div>
            {!selectedMeta && <p className="graph-detail-hint">Click a node to focus its neighborhood and see connections.</p>}
            {selectedMeta && (
              <>
                <div className="graph-detail-name">{selectedMeta.name}</div>
                <div className="graph-detail-meta">
                  <span className="graph-detail-badge">{selectedMeta.label}</span>
                  {selectedMeta.isTopInfluential && (
                    <span className="graph-detail-badge graph-detail-badge--star">Top driver</span>
                  )}
                  {selectedMeta.onCriticalPath && <span className="graph-detail-badge graph-detail-badge--crit">Critical path</span>}
                  {selectedMeta.onRiskPath && <span className="graph-detail-badge graph-detail-badge--risk">Risk path</span>}
                </div>
                {detailMode === 'doctor' &&
                  (selectedMeta.impactLevel || selectedMeta.confidence != null) && (
                    <p className="graph-detail-metrics">
                      {directionArrow(selectedMeta.direction)}{' '}
                      {selectedMeta.impactLevel ? `${selectedMeta.impactLevel} impact` : ''}
                      {selectedMeta.confidence != null
                        ? ` · Conf ${Number(selectedMeta.confidence).toFixed(2)}`
                        : ''}
                    </p>
                  )}

                {narrative && (narrative.why_it_matters || narrative.why_it_helps || narrative.factor) && (
                  <div className="graph-narrative">
                    <div className="graph-narrative-title">Explanation</div>
                    <p className="graph-narrative-body">
                      {narrative.why_it_matters ||
                        narrative.why_it_helps ||
                        narrative.factor ||
                        ''}
                    </p>
                    {detailMode === 'doctor' && narrative.impact && (
                      <p className="graph-narrative-sub">
                        <strong>Impact:</strong> {narrative.impact}
                      </p>
                    )}
                  </div>
                )}

                {!narrative && driverLine && (
                  <p className="graph-detail-driver">
                    <strong>From explanation:</strong> {driverLine}
                  </p>
                )}

                {selectedMeta.patientValue != null && (
                  <div className="graph-narrative graph-narrative--case">
                    <div className="graph-narrative-title">In this case</div>
                    <p className="graph-narrative-body">
                      {selectedMeta.name === 'IVF Success' && selectedMeta.label === 'Outcome'
                        ? `Model-estimated success probability: ${(Number(selectedMeta.patientValue) * 100).toFixed(1)}%.`
                        : `Measured value: ${selectedMeta.patientValue}${
                            selectedMeta.patientValueUnit ? ` ${selectedMeta.patientValueUnit}` : ''
                          }.`}
                    </p>
                  </div>
                )}

                {detailMode === 'doctor' && clinicalLink && (
                  <div className="graph-narrative graph-narrative--clinical">
                    <div className="graph-narrative-title">Clinical link</div>
                    <p className="graph-narrative-body graph-narrative-body--small">{clinicalLink}</p>
                  </div>
                )}

                <div className="graph-detail-neighbors-title">Connections</div>
                {neighbors.length === 0 && (
                  <p className="graph-detail-hint">No edges in the current filtered view.</p>
                )}
                <ul className="graph-detail-neighbors">
                  {neighbors.map((r) => (
                    <li key={r.key}>
                      <span className="graph-detail-dir">{r.direction}</span>
                      <span className="graph-detail-other">{r.otherName}</span>
                      {r.otherType && <span className="graph-detail-type">({r.otherType})</span>}
                      {detailMode === 'doctor' && r.relationship && (
                        <span className="graph-detail-rel">{r.relationship}</span>
                      )}
                      {detailMode === 'doctor' && r.weight != null && (
                        <span className="graph-detail-w">w {r.weight}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </aside>
      </div>

      <p className="graph-view-hint">Pan by dragging the background. Scroll to zoom. Click empty space to clear focus.</p>
    </div>
  );
};

export default GraphView;
