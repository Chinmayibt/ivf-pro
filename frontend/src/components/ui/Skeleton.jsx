import React from 'react';

export default function Skeleton({ className = '' }) {
  return <div className={`ui-skeleton ${className}`.trim()} aria-hidden />;
}
