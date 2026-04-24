import React from 'react';
import './Hero.css';
import { ChevronDown } from 'lucide-react';

const Hero = () => {
  const scrollToAbout = () => {
    document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="hero" id="hero">
      {/* Background Orbs */}
      <div className="hero__orb hero__orb--1" aria-hidden="true" />
      <div className="hero__orb hero__orb--2" aria-hidden="true" />
      <div className="hero__orb hero__orb--3" aria-hidden="true" />

      <div className="container hero__container">
        {/* Left Content */}
        <div className="hero__content">
          <div className="section-label animate-fadeInUp">
            AI-Powered Fertility Intelligence
          </div>
          <h1 className="hero__headline animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
            AI-Powered IVF Decisions, Built for
            <em className="hero__headline-em"> Better Outcomes</em>
          </h1>
          <p className="hero__sub animate-fadeInUp" style={{ animationDelay: '0.2s' }}>
            Progena combines advanced machine learning with clinical fertility data to give IVF specialists 
            real-time predictive insights — reducing guesswork and improving patient outcomes at every step.
          </p>
          {/* Stats Strip */}
          <div className="hero__stats animate-fadeInUp" style={{ animationDelay: '0.4s' }}>
            {[
              { value: '94%', label: 'Prediction Accuracy' },
              { value: '2x', label: 'Faster Decisions' },
              { value: '200+', label: 'Clinics Onboarded' },
            ].map(stat => (
              <div className="hero__stat" key={stat.label}>
                <span className="hero__stat-value">{stat.value}</span>
                <span className="hero__stat-label">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Visual */}
        <div className="hero__visual animate-fadeInRight" style={{ animationDelay: '0.25s' }}>
          <div className="hero__image-frame">
            <div className="hero__image-bg">
              <img
                src="/hero-image.jpg.png"
                alt="Mother and newborn — the outcome Progena works toward"
                className="hero__photo"
              />
              <div className="hero__photo-overlay" aria-hidden="true" />
            </div>
            {/* Floating Cards */}
            <div className="hero__float-card hero__float-card--top">
              <div className="hero__float-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1C2B4A" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
              <div>
                <div className="hero__float-label">Success Rate</div>
                <div className="hero__float-value">↑ 38%</div>
              </div>
            </div>
            <div className="hero__float-card hero__float-card--bottom">
              <div className="hero__float-icon hero__float-icon--blush">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1C2B4A" strokeWidth="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
              </div>
              <div>
                <div className="hero__float-label">Cycle Optimized</div>
                <div className="hero__float-value">AI Ready</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <button className="hero__scroll" onClick={scrollToAbout} aria-label="Scroll to about section">
        <span className="hero__scroll-text">Scroll to explore</span>
        <ChevronDown size={18} className="hero__scroll-icon" />
      </button>
    </section>
  );
};

export default Hero;
