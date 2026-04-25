import React from 'react';
import { motion } from 'framer-motion';

const baseWhileHover = { y: -2, transition: { duration: 0.16 } };
const baseWhileTap = { scale: 0.98 };

export default function Button({
  children,
  variant = 'primary',
  className = '',
  loading = false,
  disabled = false,
  ...props
}) {
  const finalDisabled = disabled || loading;
  return (
    <motion.button
      type="button"
      className={`ui-btn ui-btn--${variant} ${className}`.trim()}
      whileHover={finalDisabled ? undefined : baseWhileHover}
      whileTap={finalDisabled ? undefined : baseWhileTap}
      disabled={finalDisabled}
      {...props}
    >
      {loading ? <span className="ui-btn__spinner" aria-hidden /> : null}
      <span>{children}</span>
    </motion.button>
  );
}
