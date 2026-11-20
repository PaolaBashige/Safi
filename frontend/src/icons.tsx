import type { ReactNode } from 'react';
import type { RiskLevel } from './types';

/** Small line icons (stroke style), drawn for this project. Decorative: always hidden from assistive tech. */
function Icon({ size = 24, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const ShieldAlert = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 3 5 6v5.5c0 4.3 2.9 7.6 7 9.5 4.1-1.9 7-5.2 7-9.5V6l-7-3Z" />
    <path d="M12 8.5v4" />
    <path d="M12 15.6h.01" />
  </Icon>
);

export const Triangle = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9.5v4" />
    <path d="M12 16.8h.01" />
  </Icon>
);

export const ShieldCheck = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 3 5 6v5.5c0 4.3 2.9 7.6 7 9.5 4.1-1.9 7-5.2 7-9.5V6l-7-3Z" />
    <path d="m8.8 12.1 2.4 2.4 4-4.6" />
  </Icon>
);

export const Question = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8" />
    <path d="M12 16.8h.01" />
  </Icon>
);

export const Check = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const Info = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 7.8h.01" />
  </Icon>
);

export function RiskIcon({ level, size = 26 }: { level: RiskLevel; size?: number }) {
  if (level === 'HIGH RISK') return <ShieldAlert size={size} />;
  if (level === 'SUSPICIOUS') return <Triangle size={size} />;
  if (level === 'LOW RISK') return <ShieldCheck size={size} />;
  return <Question size={size} />;
}
