import React from 'react';

function PredictionCard({ result }) {
  if (!result) return null;

  const probability = typeof result.probability === 'number'
    ? `${(result.probability * 100).toFixed(1)}%`
    : result.probability;

  return (
    <div className="card">
      <h2>Prediction Layer</h2>
      <p><b>Prediction:</b> {result.prediction}</p>
      <p><b>Probability:</b> {probability}</p>
      <p><b>Confidence:</b> {result.confidence}</p>
    </div>
  );
}

export default PredictionCard;
