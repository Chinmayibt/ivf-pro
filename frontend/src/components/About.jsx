import React from 'react';
import './About.css';
import { ArrowRight, Award, Shield, TrendingUp } from 'lucide-react';

const About = () => (
  <section className="about" id="about">
    <div className="container about__container">
      {/* Left Image Panel */}
      <div className="about__image-col animate-fadeInLeft">
        <div className="about__image-frame">
          <AboutIllustration />
          <div className="about__badge">
            <Award size={18} />
            <span>Clinically Validated AI</span>
          </div>
        </div>
        <div className="about__image-accent" aria-hidden />
      </div>

      {/* Right Content */}
      <div className="about__content animate-fadeInRight">
        <div className="section-label">About Progena</div>
        <h2 className="about__heading">
          Meet Progena — Your IVF<br />
          <span className="about__heading-accent">Intelligence Platform</span>
        </h2>
        <p className="about__text">
          Progena is an advanced AI platform designed specifically for fertility specialists and IVF clinics. 
          By analyzing thousands of clinical data points — hormone levels, embryo grading, patient history, 
          and cycle outcomes — Progena generates accurate predictions and actionable insights at every stage of the IVF journey.
        </p>
        <p className="about__text">
          Our platform doesn't replace clinical judgment — it empowers it. Progena gives your team the confidence 
          to make data-driven decisions, personalize treatment protocols, and communicate clearly with patients 
          who are navigating one of the most emotionally significant experiences of their lives.
        </p>

        {/* Highlights */}
        <div className="about__highlights">
          {[
            { icon: TrendingUp, text: 'Predictive success modeling trained on 500K+ cycles' },
            { icon: Shield, text: 'HIPAA-compliant secure data infrastructure' },
            { icon: Award, text: 'Validated by fertility specialists across 3 continents' },
          ].map(({ icon: Icon, text }) => (
            <div className="about__highlight" key={text}>
              <div className="about__highlight-icon"><Icon size={16} /></div>
              <span>{text}</span>
            </div>
          ))}
        </div>

        <a href="#features" className="btn-primary about__btn" onClick={(e) => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); }}>
          Explore Features <ArrowRight size={16} />
        </a>
      </div>
    </div>
  </section>
);

const AboutIllustration = () => (
  <svg viewBox="0 0 380 440" fill="none" xmlns="http://www.w3.org/2000/svg" className="about__svg">
    <rect width="380" height="440" rx="24" fill="#F5E6E7"/>

    {/* Desk surface */}
    <rect x="40" y="340" width="300" height="12" rx="4" fill="#EDD5D6" opacity="0.6"/>

    {/* Monitor */}
    <rect x="80" y="180" width="220" height="150" rx="12" fill="white" opacity="0.95"/>
    <rect x="80" y="180" width="220" height="24" rx="12" fill="#1C2B4A" opacity="0.9"/>
    <circle cx="97" cy="192" r="4" fill="#D4A5A7"/>
    <circle cx="110" cy="192" r="4" fill="#E8C7C8"/>
    <circle cx="123" cy="192" r="4" fill="#8BA89B" opacity="0.6"/>

    {/* Chart on monitor */}
    <polyline points="100,300 125,280 150,285 175,265 200,255 225,260 250,248 275,238 290,242" stroke="#D4A5A7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <polygon points="100,310 125,290 150,295 175,275 200,265 225,270 250,258 275,248 290,252 290,310" fill="url(#gradChart)" opacity="0.4"/>

    <rect x="100" y="290" width="50" height="3" rx="2" fill="#E8C7C8" opacity="0.5"/>
    <rect x="100" y="297" width="35" height="3" rx="2" fill="#1C2B4A" opacity="0.15"/>

    {/* Doctor figure */}
    <circle cx="190" cy="95" r="40" fill="#EDD5D6"/>
    <rect x="152" y="138" width="76" height="8" rx="4" fill="#D4A5A7" opacity="0.5"/>

    {/* Lab coat */}
    <path d="M140 145 Q165 155 190 150 Q215 155 240 145 L248 340 H132 Z" fill="white" opacity="0.9"/>
    <path d="M178 155 L175 340" stroke="#E8C7C8" strokeWidth="2"/>
    <path d="M202 155 L205 340" stroke="#E8C7C8" strokeWidth="2"/>

    {/* Clipboard in hand */}
    <rect x="230" y="210" width="55" height="70" rx="6" fill="white" opacity="0.95"/>
    <rect x="252" y="200" width="11" height="16" rx="3" fill="#D4A5A7"/>
    <rect x="238" y="222" width="38" height="3" rx="2" fill="#E8C7C8"/>
    <rect x="238" y="230" width="30" height="3" rx="2" fill="#E8C7C8"/>
    <rect x="238" y="238" width="34" height="3" rx="2" fill="#E8C7C8"/>
    <rect x="238" y="246" width="20" height="3" rx="2" fill="#1C2B4A" opacity="0.2"/>

    {/* Stethoscope */}
    <path d="M155 175 Q140 200 150 215 Q162 230 180 218" stroke="#2D4072" strokeWidth="3" strokeLinecap="round" fill="none"/>
    <circle cx="182" cy="218" r="7" fill="#2D4072" opacity="0.8"/>

    {/* AI glow */}
    <circle cx="190" cy="95" r="55" stroke="#D4A5A7" strokeWidth="1" opacity="0.4" strokeDasharray="6 6"/>

    <defs>
      <linearGradient id="gradChart" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#D4A5A7"/>
        <stop offset="100%" stopColor="transparent"/>
      </linearGradient>
    </defs>
  </svg>
);

export default About;
