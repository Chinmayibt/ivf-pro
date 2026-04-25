import React from 'react';
import { motion } from 'framer-motion';

export default function Card({ children, className = '', interactive = false }) {
  const MotionTag = interactive ? motion.section : 'section';
  const motionProps = interactive
    ? {
        whileHover: { y: -3, transition: { duration: 0.18 } },
      }
    : {};
  return (
    <MotionTag className={`ui-card ${className}`.trim()} {...motionProps}>
      {children}
    </MotionTag>
  );
}
