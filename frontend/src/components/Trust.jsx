import React from 'react';
import './Trust.css';
import { Heart, Users, Lightbulb } from 'lucide-react';

const pillars = [
  {
    icon: Heart,
    title: 'Emotional Support at the Core',
    desc: 'We understand IVF is more than a medical process. Progena gives clinicians the clarity to guide patients with confidence and empathy throughout every stage.',
  },
  {
    icon: Users,
    title: 'Built for Clinicians, Not Just Data Scientists',
    desc: 'Progena is designed with real fertility specialists — clean interfaces, plain-language insights, and workflows that integrate seamlessly into clinic operations.',
  },
  {
    icon: Lightbulb,
    title: 'Continuous Learning System',
    desc: 'Every cycle adds to Progena\'s intelligence. Our models continuously improve, ensuring your clinic always benefits from the latest predictive breakthroughs.',
  },
];

const Trust = () => (
  <section className="trust" id="contact">
    <div className="trust__orb trust__orb--1" aria-hidden />
    <div className="trust__orb trust__orb--2" aria-hidden />

    <div className="container trust__container">
      {/* Left Visual */}
      <div className="trust__visual animate-fadeInLeft">
        <div className="trust__image-wrap">
          <TrustIllustration />
          {/* Info badge */}
          <div className="trust__quote">
            <div className="trust__quote-mark">"</div>
            <p>Progena helped us increase our live birth rate by 23% in the first six months of use.</p>
            <div className="trust__quote-attr">— Clinical Director, London Fertility Centre</div>
          </div>
        </div>
      </div>

      {/* Right Content */}
      <div className="trust__content animate-fadeInRight">
        <div className="section-label">Why Progena</div>
        <h2 className="trust__heading">
          Bringing Confidence to<br />
          <span className="trust__heading-em">Every Fertility Journey</span>
        </h2>
        <p className="trust__lead">
          The IVF journey is filled with uncertainty — for patients and clinicians alike. 
          Progena exists to reduce that uncertainty. By delivering clear, data-driven insights 
          at every decision point, we help fertility specialists give their patients the best 
          possible chance at the outcome that matters most.
        </p>

        <div className="trust__pillars">
          {pillars.map(({ icon: Icon, title, desc }) => (
            <div className="trust__pillar" key={title}>
              <div className="trust__pillar-icon">
                <Icon size={18} />
              </div>
              <div>
                <h4 className="trust__pillar-title">{title}</h4>
                <p className="trust__pillar-desc">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

const TrustIllustration = () => (
  <svg viewBox="0 0 360 420" fill="none" xmlns="http://www.w3.org/2000/svg" className="trust__svg">
    <rect width="360" height="420" rx="28" fill="url(#trustBg)"/>

    {/* Warm consultation scene */}
    {/* Doctor */}
    <circle cx="110" cy="130" r="40" fill="#EDD5D6"/>
    <path d="M60 175 Q110 185 160 175 L168 380 H52 Z" fill="white" opacity="0.85"/>
    <path d="M98 185 L95 380" stroke="#E8C7C8" strokeWidth="2"/>
    <path d="M122 185 L125 380" stroke="#E8C7C8" strokeWidth="2"/>
    <path d="M72 200 Q62 230 72 245 Q82 260 92 250" stroke="#2D4072" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <circle cx="75" cy="250" r="5" fill="#2D4072" opacity="0.8"/>

    {/* Patient (seated) */}
    <circle cx="260" cy="190" r="35" fill="#EDD5D6" opacity="0.9"/>
    <path d="M218 228 Q260 238 302 228 L308 380 H212 Z" fill="#F5E6E7" opacity="0.9"/>
    <path d="M248 238 L245 380" stroke="#EDD5D6" strokeWidth="1.5"/>
    <path d="M272 238 L275 380" stroke="#EDD5D6" strokeWidth="1.5"/>

    {/* Consultation table */}
    <rect x="130" y="300" width="105" height="80" rx="10" fill="#FAF7F4" opacity="0.9"/>
    <rect x="145" y="315" width="75" height="4" rx="2" fill="#E8C7C8"/>
    <rect x="145" y="325" width="55" height="4" rx="2" fill="#E8C7C8"/>
    <rect x="145" y="335" width="64" height="4" rx="2" fill="#1C2B4A" opacity="0.15"/>

    {/* Tablet */}
    <rect x="148" y="345" width="70" height="48" rx="8" fill="#1C2B4A" opacity="0.08"/>
    <rect x="153" y="350" width="60" height="38" rx="5" fill="white" opacity="0.9"/>
    <polyline points="158,378 168,368 180,372 192,360 200,362" stroke="#D4A5A7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>

    {/* Heart connection */}
    <path d="M165 270 Q185 255 210 265" stroke="#D4A5A7" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round"/>
    <path d="M180 255 C180 255 176 250 180 247 C184 244 186 250 186 250 C186 250 192 244 196 247 C200 250 196 257 186 262 C184 258 180 255 180 255 Z" fill="#D4A5A7" opacity="0.7"/>

    {/* AI aura rings */}
    <circle cx="110" cy="130" r="52" stroke="#D4A5A7" strokeWidth="1" opacity="0.3" strokeDasharray="5 5"/>
    <circle cx="110" cy="130" r="65" stroke="#E8C7C8" strokeWidth="0.8" opacity="0.2" strokeDasharray="3 7"/>

    {/* Sparkles */}
    <circle cx="310" cy="120" r="5" fill="#E8C7C8" opacity="0.7"/>
    <circle cx="325" cy="145" r="3" fill="#D4A5A7" opacity="0.5"/>
    <circle cx="40" cy="350" r="6" fill="#EDD5D6" opacity="0.5"/>

    <defs>
      <linearGradient id="trustBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#F5E6E7"/>
        <stop offset="100%" stopColor="#FAF7F4"/>
      </linearGradient>
    </defs>
  </svg>
);

export default Trust;
