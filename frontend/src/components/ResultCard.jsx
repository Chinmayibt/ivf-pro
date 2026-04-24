import React from 'react';
import './ResultCard.css';

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

const ResultCard = ({ result, loading }) => {
  if (loading) {
    return <div className="result-card">Running prediction...</div>;
  }

  if (!result) {
    return <div className="result-card">Submit input to view prediction results.</div>;
  }

  const probabilityPct = typeof result.probability === 'number'
    ? `${(result.probability * 100).toFixed(1)}%`
    : result.probability || 'Not available';
  const explanation = result.explanation || {};

  return (
    <div className="result-card">
      <h2>Prediction Result</h2>
      <div className="meta">
        <div><strong>Prediction:</strong> {result.prediction}</div>
        <div><strong>Probability:</strong> {probabilityPct}</div>
        <div><strong>Confidence:</strong> {result.confidence}</div>
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
        <h3>Key Drivers</h3>
        <ul>{renderList(explanation.key_drivers, 'No key drivers identified', 2)}</ul>
      </div>

      <div className="columns">
        <div className="block">
          <h3>Positive Factors</h3>
          {renderPositiveFactors(explanation.positive_factors)}
        </div>
        <div className="block">
          <h3>Negative Factors</h3>
          {renderNegativeFactors(explanation.negative_factors, 'No major risk factors', 2)}
        </div>
      </div>
    </div>
  );
};

export default ResultCard;
