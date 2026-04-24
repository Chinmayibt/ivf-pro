import React, { useState } from 'react';
import './Features.css';
import { BarChart2 } from 'lucide-react';

const features = [
  {
    id: 'predictive-success',
    icon: BarChart2,
    title: 'IVF Predictor',
    description:
      'Run IVF outcome prediction from manual notes, structured clinical columns, or uploaded reports using the Progena NLP layer.',
    tags: ['Predictor', 'NLP'],
  },
];

const Features = () => {
  const [hovered, setHovered] = useState(null);

  return (
    <section className="features" id="features">
      {/* Background accents */}
      <div className="features__orb" aria-hidden />

      <div className="container">
        <div className="features__header">
          <div className="section-label">Core Capabilities</div>
          <h2 className="features__title">
            Everything Your Clinic Needs,<br />
            <span className="features__title-em">Powered by Intelligence</span>
          </h2>
          <p className="features__subtitle">
            Progena currently provides one production-ready capability: the IVF Predictor.
            It is fully wired from frontend input to backend NLP inference and explainable output.
          </p>
        </div>

        <div className="features__grid">
          {features.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <div
                className={`feature-card${hovered === i ? ' feature-card--hovered' : ''}`}
                key={feat.id}
                id={feat.id}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div className="feature-card__icon-wrap">
                  <Icon size={22} className="feature-card__icon" />
                  <div className="feature-card__icon-glow" aria-hidden />
                </div>
                <h3 className="feature-card__title">{feat.title}</h3>
                <p className="feature-card__desc">{feat.description}</p>
                <div className="feature-card__tags">
                  {feat.tags.map(t => (
                    <span className="feature-card__tag" key={t}>{t}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Features;
