import React from 'react';

function KnowledgeLayer({ explanation }) {
  if (!explanation) return null;

  const keyDrivers = explanation.key_drivers || [];
  const positiveFactors = explanation.positive_factors || [];
  const negativeFactors = explanation.negative_factors || [];

  return (
    <div className="card">
      <h2>Knowledge Layer</h2>

      <h3>Summary</h3>
      <p>{explanation.summary || 'No summary available.'}</p>

      <h3>Key Drivers</h3>
      <ul>
        {keyDrivers.length > 0 ? keyDrivers.map((d, i) => <li key={i}>{d}</li>) : <li>No key drivers identified</li>}
      </ul>

      <h3>Positive Factors</h3>
      {positiveFactors.length > 0 ? positiveFactors.map((f, i) => (
        <div key={i}>
          <strong>{f.factor || f}</strong>
          <p>{f.why_it_helps || f.why_it_matters || ''}</p>
        </div>
      )) : <p>No strong positive factors</p>}

      <h3>Negative Factors</h3>
      {negativeFactors.length > 0 ? negativeFactors.map((f, i) => (
        <div key={i} style={{ marginBottom: '15px' }}>
          <strong>{f.factor || f}</strong>
          <p><b>Why:</b> {f.why_it_matters || '-'}</p>
          <p><b>Impact:</b> {f.impact || '-'}</p>
          <p><b>How to improve:</b></p>
          <ul>
            {(f.how_to_improve?.short_term || []).map((t, idx) => (
              <li key={idx}>{t}</li>
            ))}
          </ul>
        </div>
      )) : <p>No major risk factors</p>}
    </div>
  );
}

export default KnowledgeLayer;
