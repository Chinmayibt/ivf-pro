import React from 'react';

export default function MeterRing({ value = 0, label = 'Probability' }) {
  const raw = Number(value);
  const normalized = Number.isFinite(raw) ? (raw <= 1 ? raw * 100 : raw) : 0;
  const pct = Math.max(0, Math.min(100, normalized));
  const displayPct = pct.toFixed(1).replace('.0', '');
  return (
    <div className="ui-meter-ring" role="img" aria-label={`${label} ${pct}%`}>
      <svg viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="52" className="ui-meter-ring__bg" />
        <circle
          cx="60"
          cy="60"
          r="52"
          className="ui-meter-ring__value"
          style={{ strokeDashoffset: `${327 - (327 * pct) / 100}` }}
        />
      </svg>
      <div className="ui-meter-ring__center">
        <strong>{displayPct}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
