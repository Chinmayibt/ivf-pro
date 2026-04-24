import React, { useMemo, useState } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import './GraphView.css';

function convertToCytoscape(graphData, riskPaths, criticalPath) {
  if (!graphData || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.links)) {
    return { elements: [], nodeMeta: {} };
  }

  const MAX_NODES = 50;
  const slicedNodes = graphData.nodes.slice(0, MAX_NODES);
  const allowed = new Set(slicedNodes);
  const slicedLinks = graphData.links.filter((e) => allowed.has(e.source) && allowed.has(e.target));

  const criticalSet = new Set(criticalPath || []);
  const riskSet = new Set();
  (riskPaths || []).forEach((p) => (p || []).forEach((n) => riskSet.add(n)));

  const riskEdges = new Set();
  (riskPaths || []).forEach((path) => {
    for (let i = 0; i < (path || []).length - 1; i += 1) {
      riskEdges.add(`${path[i]}->${path[i + 1]}`);
    }
  });
  const criticalEdges = new Set();
  for (let i = 0; i < (criticalPath || []).length - 1; i += 1) {
    criticalEdges.add(`${criticalPath[i]}->${criticalPath[i + 1]}`);
  }

  const nodeMeta = {};
  const nodes = slicedNodes.map((n) => {
    nodeMeta[n] = { name: n };
    return {
      data: { id: n, label: n },
    };
  });

  const edges = slicedLinks.map((e, idx) => {
    const key = `${e.source}->${e.target}`;
    return {
      data: { id: `e-${idx}-${e.source}-${e.target}`, source: e.source, target: e.target },
      classes: criticalEdges.has(key) ? 'edge-critical' : riskEdges.has(key) ? 'edge-risk' : 'edge-default',
    };
  });

  return { elements: [...nodes, ...edges], nodeMeta };
}

const GraphView = ({ graphData, riskPaths, criticalPath, explanation }) => {
  const [activeNode, setActiveNode] = useState(null);
  const { elements, nodeMeta } = useMemo(
    () => convertToCytoscape(graphData, riskPaths, criticalPath),
    [graphData, riskPaths, criticalPath]
  );

  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    return <div className="graph-view-empty">Graph will appear after prediction</div>;
  }

  const allExplanation = [
    ...(explanation?.positive_factors || []),
    ...(explanation?.negative_factors || []),
    ...(explanation?.key_drivers || []),
  ];
  const related = activeNode
    ? allExplanation
        .map((line) => (typeof line === 'string' ? line : line?.factor || line?.why_it_matters || line?.why_it_helps || ''))
        .find((line) => line.toLowerCase().includes(activeNode.toLowerCase()))
    : null;

  return (
    <div className="graph-view-wrap">
      <h2>Knowledge Graph</h2>
      <CytoscapeComponent
        elements={elements}
        style={{ width: '100%', height: '250px' }}
        layout={{
          name: 'breadthfirst',
          directed: true,
          padding: 10,
          animate: false,
        }}
        stylesheet={[
          {
            selector: 'node',
            style: {
              'background-color': (ele) => {
                const id = ele.data('id');
                if ((criticalPath || []).includes(id)) return '#F18F01';
                if (id.includes('Success')) return '#2E7D62';
                if (id.includes('Low') || id.includes('Risk')) return '#B42318';
                if (id.includes('Embryo') || id.includes('Egg')) return '#F18F01';
                return '#415A77';
              },
              label: 'data(label)',
              'font-size': '11px',
              'text-wrap': 'wrap',
              'text-max-width': '80px',
              color: '#091022',
              'font-weight': 700,
              'text-outline-width': 0,
            },
          },
          {
            selector: 'edge',
            style: {
              width: 2,
              'line-color': '#999',
              'target-arrow-color': '#999',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
            },
          },
          { selector: '.edge-risk', style: { 'line-color': '#B42318', 'target-arrow-color': '#B42318' } },
          { selector: '.edge-critical', style: { 'line-color': '#F18F01', 'target-arrow-color': '#F18F01' } },
        ]}
        cy={(cy) => {
          cy.removeAllListeners('tap');
          cy.on('tap', 'node', (evt) => {
            const id = evt.target.id();
            setActiveNode(nodeMeta[id]?.name || id);
          });
        }}
      />

      {activeNode && (
        <div className="graph-node-popup">
          <strong>{activeNode}</strong>
          <p>{related || 'No direct explanation mapping for this node yet.'}</p>
        </div>
      )}
    </div>
  );
};

export default GraphView;
