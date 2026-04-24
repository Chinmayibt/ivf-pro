import React, { useState } from 'react';
import './CTA.css';
import { ArrowRight, CheckCircle } from 'lucide-react';

const benefits = [
  'Setup in under 48 hours',
  'No long-term contracts',
  'Dedicated onboarding specialist',
];

const CTA = () => {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email) setSubmitted(true);
  };

  return (
    <section className="cta-section" id="cta">
      <div className="cta-section__bg" aria-hidden />
      <div className="cta-section__orb cta-section__orb--1" aria-hidden />
      <div className="cta-section__orb cta-section__orb--2" aria-hidden />

      <div className="container cta-section__inner">
        <div className="section-label cta-section__label">Get Started</div>
        <h2 className="cta-section__heading">
          Transform IVF Outcomes<br />
          <span className="cta-section__heading-em">with Progena</span>
        </h2>
        <p className="cta-section__sub">
          Join leading fertility clinics already using Progena to make smarter IVF decisions. 
          See the platform in action with a personalized 30-minute demo.
        </p>

        {/* Benefits */}
        <div className="cta-section__benefits">
          {benefits.map(b => (
            <div className="cta-section__benefit" key={b}>
              <CheckCircle size={16} />
              <span>{b}</span>
            </div>
          ))}
        </div>

        {/* Form */}
        {!submitted ? (
          <form className="cta-section__form" onSubmit={handleSubmit} id="demo-form">
            <div className="cta-section__form-inner">
              <input
                type="email"
                className="cta-section__input"
                placeholder="Enter your work email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                id="demo-email"
                aria-label="Work email address"
              />
              <button type="submit" className="btn-primary cta-section__btn" id="book-demo-btn">
                Book a Demo <ArrowRight size={16} />
              </button>
            </div>
            <p className="cta-section__disclaimer">
              No spam. No commitment. We'll reach out within one business day.
            </p>
          </form>
        ) : (
          <div className="cta-section__success">
            <CheckCircle size={28} />
            <div>
              <strong>Thank you! We'll be in touch soon.</strong>
              <p>Our team will contact you at <em>{email}</em> within 24 hours.</p>
            </div>
          </div>
        )}

        {/* Social proof mini */}
        <div className="cta-section__proof">
          <div className="cta-section__avatars">
            {[1,2,3,4].map(i => (
              <div key={i} className="cta-section__avatar" style={{ background: i % 2 === 0 ? 'var(--blush-deep)' : 'var(--navy-soft)', zIndex: 5-i }}>
                {String.fromCharCode(64 + i)}
              </div>
            ))}
          </div>
          <span>Trusted by <strong>200+</strong> fertility specialists worldwide</span>
        </div>
      </div>
    </section>
  );
};

export default CTA;
