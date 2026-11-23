// Line icons (24px grid, stroke 1.8), drawn for this game.

import type { ReactNode } from "react";

const I = ({ children, size = 18 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const Icons = {
  home: () => <I><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></I>,
  inbox: () => <I><path d="M3 13.5 5.5 5h13l2.5 8.5" /><path d="M3 13.5V19h18v-5.5h-5.5a3.5 3.5 0 0 1-7 0H3Z" /></I>,
  user: () => <I><circle cx="12" cy="8" r="4" /><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></I>,
  training: () => <I><path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" /></I>,
  glove: () => <I><path d="M7 11V7.5A3.5 3.5 0 0 1 10.5 4h3A4.5 4.5 0 0 1 18 8.5V13a5 5 0 0 1-5 5H9.5A2.5 2.5 0 0 1 7 15.5V11Z" /><path d="M7 11H5.5A1.5 1.5 0 0 0 4 12.5v0A2.5 2.5 0 0 0 6.5 15H7" /><path d="M9 18v2.5h6V18" /><path d="M11 8h4" /></I>,
  contract: () => <I><path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Z" /><path d="M14 3.5V8h4.5M8.5 12.5h7M8.5 16h4" /></I>,
  money: () => <I><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 9.5v.01M17.5 14.5v.01" /></I>,
  calendar: () => <I><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></I>,
  trophy: () => <I><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M9.5 17h5" /></I>,
  belt: () => <I><rect x="2.5" y="9" width="19" height="6" rx="1.5" /><circle cx="12" cy="12" r="3.6" /><path d="M12 10.3v3.4" /></I>,
  news: () => <I><path d="M5 5.5h11v13H6.5A1.5 1.5 0 0 1 5 17V5.5Z" /><path d="M16 9h3v8a1.5 1.5 0 0 1-3 0" /><path d="M8 9h5M8 12h5M8 15h3" /></I>,
  search: () => <I><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></I>,
  building: () => <I><path d="M4 20.5V8l8-4.5L20 8v12.5" /><path d="M8 20.5v-5h8v5M8 11h.01M12 11h.01M16 11h.01" /></I>,
  settings: () => <I><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></I>,
  users: () => <I><circle cx="9" cy="8" r="3.5" /><path d="M2.5 19.5c.9-3 3.4-4.8 6.5-4.8s5.6 1.8 6.5 4.8" /><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.5M18 14.9c1.7.6 3 2.2 3.5 4.6" /></I>,
  binoculars: () => <I><circle cx="6.5" cy="15.5" r="3.5" /><circle cx="17.5" cy="15.5" r="3.5" /><path d="M10 15.5h4M5 12l2-7h3v10.5M19 12l-2-7h-3v10.5" /></I>,
  briefcase: () => <I><rect x="3" y="7" width="18" height="12.5" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18" /></I>,
  play: () => <I><path d="M7 5v14l11-7L7 5Z" /></I>,
  bolt: () => <I><path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" /></I>,
  heart: () => <I><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></I>,
  alert: () => <I><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4.5M12 17.5v.01" /></I>,
  check: () => <I><path d="m5 12.5 4.5 4.5L19 7.5" /></I>,
  x: () => <I><path d="M6 6l12 12M18 6 6 18" /></I>,
  arrow: () => <I><path d="M5 12h14M13 6l6 6-6 6" /></I>,
  menu: () => <I><path d="M4 7h16M4 12h16M4 17h16" /></I>,
  star: () => <I><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8L12 3.5Z" /></I>,
  medkit: () => <I><rect x="3.5" y="7" width="17" height="12.5" rx="2" /><path d="M9 7V5h6v2M12 10.5v5.5M9.2 13.2h5.6" /></I>,
  scale: () => <I><path d="M12 4v16M6 20h12M5 8h14" /><path d="M5 8 2.5 13.5a3 3 0 0 0 5 0L5 8ZM19 8l-2.5 5.5a3 3 0 0 0 5 0L19 8Z" /></I>,
};

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M10 2h12l8 8v12l-8 8H10l-8-8V10l8-8Z" fill="var(--accent)" />
      <path d="M11.5 5.5h9l6 6v9l-6 6h-9l-6-6v-9l6-6Z" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.2" />
      <path d="M9.5 21V11l3.6 5.2L16.7 11v10M19.2 21V11l3.6 5.2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
