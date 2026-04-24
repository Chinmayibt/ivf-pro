import React, { useRef, useEffect, useState } from 'react';
import './HowItWorks.css';
import { Upload, Cpu, TrendingUp, Stethoscope } from 'lucide-react';

const steps = [
  {
    id: 1,
    icon: Upload,
    title: 'Upload Patient Data',
    desc: 'Securely import lab results, cycle history, hormone profiles, and clinical notes into Progena\'s unified platform.',
    color: 'var(--blush-primary)',
  },
  {
    id: 2,
    icon: Cpu,
    title: 'AI Analyzes Patterns',
    desc: 'Progena\'s models process thousands of data points against benchmarks from 500K+ IVF cycles to surface meaningful clinical signals.',
    color: 'var(--sage-light)',
  },
  {
    id: 3,
    icon: TrendingUp,
    title: 'Generates Predictions',
    desc: 'Receive clear probability scores, cycle risk flags, and treatment recommendations — ranked by confidence and clinical impact.',
    color: 'var(--gold-light)',
  },
  {
    id: 4,
    icon: Stethoscope,
    title: 'Doctor Makes Informed Decisions',
    desc: 'Your clinical team reviews AI insights alongside patient context and makes empowered, evidence-backed decisions with confidence.',
    color: 'var(--cream-deep)',
  },
];

const HowItWorks = () => {
  const [activeStep, setActiveStep] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setActiveStep(s => (s + 1) % steps.length);
    }, 3000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const handleStep = (i) => {
    setActiveStep(i);
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveStep(s => (s + 1) % steps.length);
    }, 3000);
  };

  return (
    <section className="how" id="how-it-works">
      <div className="container">
        <div className="how__header">
          <div className="section-label">The Process</div>
          <h2 className="how__title">
            From Data to Decision —<br />
            <span className="how__title-em">In Four Intelligent Steps</span>
          </h2>
          <p className="how__subtitle">
            Progena transforms raw clinical data into clear, actionable fertility intelligence with a streamlined four-step workflow.
          </p>
        </div>

        {/* Steps Row */}
        <div className="how__steps">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isActive = activeStep === i;
            return (
              <React.Fragment key={step.id}>
                <div
                  className={`how__step${isActive ? ' how__step--active' : ''}`}
                  onClick={() => handleStep(i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && handleStep(i)}
                  id={`step-${step.id}`}
                >
                  <div
                    className="how__step-icon"
                    style={{ background: isActive ? step.color : 'var(--cream-deep)' }}
                  >
                    <Icon size={24} />
                    <div className="how__step-num">{step.id}</div>
                  </div>
                  <h3 className="how__step-title">{step.title}</h3>
                  <p className="how__step-desc">{step.desc}</p>
                  <div className={`how__step-line${isActive ? ' how__step-line--visible' : ''}`} />
                </div>

                {/* Connector Arrow */}
                {i < steps.length - 1 && (
                  <div className={`how__connector${i < activeStep ? ' how__connector--done' : ''}`}>
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                      <path d="M8 20 H28 M22 14 L30 20 L22 26" stroke={i < activeStep ? 'var(--navy-deep)' : 'var(--blush-deep)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Active Step Detail */}
        <div className="how__detail">
          {steps.map((step, i) => (
            <div
              key={step.id}
              className={`how__detail-item${activeStep === i ? ' how__detail-item--visible' : ''}`}
            >
              <div className="how__detail-pill" style={{ background: step.color }}>
                Step {step.id} of {steps.length}
              </div>
              <p className="how__detail-text">{step.desc}</p>
            </div>
          ))}
        </div>

        {/* Progress Dots */}
        <div className="how__dots">
          {steps.map((_, i) => (
            <button
              key={i}
              className={`how__dot${activeStep === i ? ' how__dot--active' : ''}`}
              onClick={() => handleStep(i)}
              aria-label={`Step ${i + 1}`}
              id={`dot-step-${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
