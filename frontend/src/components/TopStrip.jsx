import React from 'react';
import './TopStrip.css';
import { Sparkles } from 'lucide-react';

const TopStrip = () => (
  <div className="top-strip">
    <div className="top-strip__inner">
      <Sparkles size={14} className="top-strip__icon" />
      <span>Supporting better IVF decisions with intelligent insights.</span>
      <Sparkles size={14} className="top-strip__icon" />
    </div>
  </div>
);

export default TopStrip;
