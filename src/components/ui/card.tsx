import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-xl bg-white/80 dark:bg-[#181425]/80 backdrop-blur-sm border border-[#e6e0f0] dark:border-[#2d283a] shadow-[0_1px_3px_rgba(58,45,125,0.04),0_4px_12px_rgba(58,45,125,0.06)] p-6 transition-all duration-200 hover:shadow-[0_4px_16px_rgba(58,45,125,0.08)] ${className}`}
    >
      {children}
    </div>
  );
}
