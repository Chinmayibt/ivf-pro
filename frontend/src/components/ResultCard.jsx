import React from 'react';
import { motion } from 'framer-motion';
import './ResultCard.css';
import MeterRing from './ui/MeterRing';
import Card from './ui/Card';
import Skeleton from './ui/Skeleton';

const renderList = (items, emptyLabel, limit = 3) => {
  if (!items || items.length === 0) return <li className="empty">{emptyLabel}</li>;
  return items.slice(0, limit).map((item, idx) => <li key={`${String(item)}-${idx}`}>{String(item)}</li>);
};

const renderPositiveFactors = (items) => {
  if (!items || items.length === 0) return <p className="empty">No strong positive factors</p>;
  return items.slice(0, 2).map((item, i) => {
    if (typeof item === 'string') {
      return (
        <div key={i} style={{ marginBottom: '10px' }}>
          <strong>{item}</strong>
        </div>
      );
    }
    return (
      <div key={i} style={{ marginBottom: '10px' }}>
        <strong>{item.factor}</strong>
        <p><b>Why it helps:</b> {item.why_it_helps || item.why_it_matters}</p>
      </div>
    );
  });
};

const renderNegativeFactors = (items, emptyLabel, limit = 2) => {
  if (!items || items.length === 0) return <p className="empty">{emptyLabel}</p>;

  return items.slice(0, limit).map((item, idx) => {
    if (typeof item === 'string') {
      return <div key={`${item}-${idx}`}>{item}</div>;
    }

    const factor = item?.factor || 'Unspecified risk factor';
    const severity = String(item?.severity || 'moderate').toUpperCase();
    const why = item?.why_it_matters;
    const impact = item?.impact;
    const improve = item?.how_to_improve || {};
    const shortTerm = Array.isArray(improve?.short_term) ? improve.short_term : [];
    const beforeCycle = Array.isArray(improve?.before_next_cycle) ? improve.before_next_cycle : [];
    const clinicalOptions = Array.isArray(improve?.clinical_options) ? improve.clinical_options : [];

    return (
      <div key={`${factor}-${idx}`} style={{ marginBottom: '15px' }}>
        <strong>{`${factor} - ${severity} impact`}</strong>
        {why ? <p><b>Why it matters:</b> {why}</p> : null}
        {impact ? <p><b>Impact:</b> {impact}</p> : null}
        {(shortTerm.length > 0 || beforeCycle.length > 0 || clinicalOptions.length > 0) ? (
          <>
            <p><b>What you can do:</b></p>
            {shortTerm.length > 0 ? (
              <>
                <p><b>Immediate:</b></p>
                <ul>
                  {shortTerm.slice(0, 3).map((step, stepIdx) => (
                    <li key={`${factor}-short-${stepIdx}`}>{step}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {beforeCycle.length > 0 ? (
              <>
                <p><b>Before next cycle:</b></p>
                <ul>
                  {beforeCycle.slice(0, 3).map((step, stepIdx) => (
                    <li key={`${factor}-before-${stepIdx}`}>{step}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {clinicalOptions.length > 0 ? (
              <>
                <p><b>Clinical options:</b></p>
                <ul>
                  {clinicalOptions.slice(0, 3).map((step, stepIdx) => (
                    <li key={`${factor}-clinical-${stepIdx}`}>{step}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    );
  });
};

const getNextSteps = (items) => {
  if (!Array.isArray(items)) return [];
  const steps = [];
  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const improve = item.how_to_improve || {};
    const source = [
      ...(Array.isArray(improve.short_term) ? improve.short_term : []),
      ...(Array.isArray(improve.before_next_cycle) ? improve.before_next_cycle : []),
      ...(Array.isArray(improve.clinical_options) ? improve.clinical_options : []),
    ];
    source.forEach((step) => {
      if (typeof step === 'string' && step.trim()) steps.push(step);
    });
  });
  return [...new Set(steps)].slice(0, 4);
};

const ResultCard = ({ result, loading }) => {
  if (loading) {
    return (
      <Card className="result-card">
        <Skeleton className="result-skeleton result-skeleton--title" />
        <Skeleton className="result-skeleton result-skeleton--row" />
        <Skeleton className="result-skeleton result-skeleton--row" />
        <Skeleton className="result-skeleton result-skeleton--row" />
      </Card>
    );
  }

  if (!result) {
    return <Card className="result-card">Submit input to view prediction results.</Card>;
  }

  const numericProb = Number(result.probability);
  const normalizedProbability = Number.isFinite(numericProb)
    ? Math.max(0, Math.min(100, numericProb <= 1 ? numericProb * 100 : numericProb))
    : null;
  const probabilityPct = normalizedProbability != null
    ? `${normalizedProbability.toFixed(1)}%`
    : result.probability || 'Not available';
  const explanation = result.explanation || {};
  const nextSteps = getNextSteps(explanation.negative_factors);

  const confidenceMap = { High: 90, Medium: 65, Low: 35 };
  const numericConfidence = Number(result.confidence);
  const confidenceValue = Number.isFinite(numericConfidence)
    ? Math.max(0, Math.min(100, numericConfidence <= 1 ? numericConfidence * 100 : numericConfidence))
    : (confidenceMap[result.confidence] || 50);
  const confidenceLabel = Number.isFinite(numericConfidence)
    ? `${confidenceValue.toFixed(1)}%`
    : (result.confidence || 'Medium');
  const confidenceSummary = Number.isFinite(numericConfidence)
    ? `${confidenceValue.toFixed(1)}%`
    : confidenceLabel;
  const predictionTone = String(result.prediction || '').toLowerCase().includes('fail') ? 'risk' : 'success';

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
    <Card className="result-card">
      <h2>Prediction Result</h2>
      <div className="result-top-grid">
        <MeterRing value={normalizedProbability ?? 0} label="Success Odds" />
        <div className="result-confidence">
          <strong>Confidence Meter</strong>
          <div className="confidence-track">
            <div className="confidence-fill" style={{ width: `${confidenceValue}%` }} />
          </div>
          <span>{confidenceLabel}</span>
          <p>Why this prediction: Model combines ovarian reserve, embryo quality, and treatment context.</p>
        </div>
      </div>
      <div className="meta">
        <div className={`meta-item meta-item--${predictionTone}`}>
          <span className="meta-item__label">Prediction</span>
          <strong className="meta-item__value">{result.prediction}</strong>
        </div>
        <div className="meta-item">
          <span className="meta-item__label">Probability</span>
          <strong className="meta-item__value">{probabilityPct}</strong>
        </div>
        <div className="meta-item">
          <span className="meta-item__label">Confidence</span>
          <strong className="meta-item__value">{confidenceSummary}</strong>
        </div>
      </div>

      <div className="block ai-insight">
        <h3>AI Insight Panel</h3>
        <p>{explanation.summary || 'No summary available.'}</p>
      </div>

      <div className="block">
        <h3>Summary</h3>
        <p>{explanation.summary || 'No summary available.'}</p>
      </div>

      <div className="block">
        <h3>Why</h3>
        <p>
          {explanation.why ||
            ((result.critical_path?.length || result.risk_paths?.length)
              ? 'Graph pathways indicate interacting risks and protective factors across the IVF process.'
              : 'Key factors influencing this outcome include ovarian reserve, embryo quality, and metabolic health.')}
        </p>
      </div>

      <div className="block">
        <h3>Top contributing factors</h3>
        <ul>{renderList(explanation.key_drivers, 'No key drivers identified', 2)}</ul>
      </div>

      <div className="columns">
        <div className="block">
          <h3>Risk vs positive signals: positive</h3>
          {renderPositiveFactors(explanation.positive_factors)}
        </div>
        <div className="block">
          <h3>Risk vs positive signals: risk</h3>
          {renderNegativeFactors(explanation.negative_factors, 'No major risk factors', 2)}
        </div>
      </div>
      <div className="block ai-next-steps">
        <h3>What should be done next?</h3>
        <ul>{renderList(nextSteps, 'No immediate actions generated yet.', 4)}</ul>
      </div>
    </Card>
    </motion.div>
  );
};

export default ResultCard;
