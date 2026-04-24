import React from 'react';
import './ResultCard.css';

const renderList = (items, emptyLabel) => {
  if (!items || items.length === 0) return <li className="empty">{emptyLabel}</li>;
  return items.map((item) => <li key={item}>{item}</li>);
};

const ResultCard = ({ result, loading }) => {
  if (loading) {
    return <div className="result-card">Running prediction...</div>;
  }

  if (!result) {
    return <div className="result-card">Submit input to view prediction results.</div>;
  }

  const probabilityPct = `${(result.probability * 100).toFixed(1)}%`;
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
        <p>{explanation.why || 'No causal reasoning available.'}</p>
      </div>

      <div className="block">
        <h3>Key Drivers</h3>
        <ul>{renderList(explanation.key_drivers, 'No key drivers identified')}</ul>
      </div>

      <div className="columns">
        <div className="block">
          <h3>Positive Factors</h3>
          <ul>{renderList(explanation.positive_factors, 'No strong positive factors')}</ul>
        </div>
        <div className="block">
          <h3>Negative Factors</h3>
          <ul>{renderList(explanation.negative_factors, 'No major risk factors')}</ul>
        </div>
      </div>
    </div>
  );
};

export default ResultCard;
