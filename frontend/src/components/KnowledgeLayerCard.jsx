import React from 'react';
import './ResultCard.css';

const KnowledgeLayerCard = ({ result, loading }) => {
  if (loading) return <div className="result-card knowledge-card">Loading knowledge layer...</div>;
  if (!result) return <div className="result-card knowledge-card">Knowledge layer will appear after prediction.</div>;

  const criticalPath = result.critical_path || [];
  const riskPaths = result.risk_paths || [];

  return (
    <div className="result-card knowledge-card">
      <h2>Knowledge Layer</h2>
      <div className="block">
        <h3>Most Influential Path</h3>
        {criticalPath.length ? (
          <p>{criticalPath.join(' -> ')}</p>
        ) : (
          <p className="empty">No critical path available.</p>
        )}
      </div>

      <div className="block">
        <h3>Risk Pathways</h3>
        {riskPaths.length ? (
          <ul>
            {riskPaths.slice(0, 3).map((path, idx) => (
              <li key={`${idx}-${path.join('-')}`}>{path.join(' -> ')}</li>
            ))}
          </ul>
        ) : (
          <p className="empty">No strong causal risk pathways identified.</p>
        )}
      </div>
    </div>
  );
};

export default KnowledgeLayerCard;
