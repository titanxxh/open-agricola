import type { ReactNode } from 'react'

export type EmptyArtName = 'tractor' | 'cards' | 'wheat' | 'fence' | 'magnifier'

const ART: Record<EmptyArtName, ReactNode> = {
  tractor: (
    <svg viewBox="0 0 60 60" width="60" height="60" aria-hidden focusable="false">
      <ellipse cx="30" cy="52" rx="22" ry="2" fill="#000" opacity="0.08" />
      <rect x="14" y="26" width="24" height="14" rx="2" fill="#d4a017" />
      <rect x="32" y="20" width="14" height="14" rx="2" fill="#5a8b3a" />
      <rect x="35" y="23" width="8" height="6" fill="#cfe0bf" />
      <rect x="14" y="22" width="6" height="6" fill="#3f2a18" />
      <circle cx="20" cy="44" r="6" fill="#3f2a18" />
      <circle cx="20" cy="44" r="2.5" fill="#a48657" />
      <circle cx="42" cy="46" r="4" fill="#3f2a18" />
      <circle cx="42" cy="46" r="1.6" fill="#a48657" />
    </svg>
  ),
  cards: (
    <svg viewBox="0 0 60 60" width="60" height="60" aria-hidden focusable="false">
      <ellipse cx="30" cy="52" rx="20" ry="2" fill="#000" opacity="0.08" />
      <rect x="12" y="14" width="24" height="34" rx="3" fill="#fff7e6" stroke="#a07b3a" strokeWidth="1.2" transform="rotate(-8 24 31)" />
      <rect x="20" y="12" width="24" height="34" rx="3" fill="#fff" stroke="#a07b3a" strokeWidth="1.2" />
      <rect x="24" y="18" width="16" height="3" fill="#5a3a1f" opacity="0.6" />
      <rect x="24" y="24" width="12" height="2" fill="#5a3a1f" opacity="0.4" />
      <circle cx="40" cy="40" r="3" fill="#d4a017" />
    </svg>
  ),
  wheat: (
    <svg viewBox="0 0 60 60" width="60" height="60" aria-hidden focusable="false">
      <ellipse cx="30" cy="52" rx="20" ry="2" fill="#000" opacity="0.08" />
      <path d="M30 50 V18" stroke="#7a5a25" strokeWidth="2" strokeLinecap="round" />
      <g fill="#e2b94a" stroke="#9c7a1c" strokeWidth="0.8">
        <ellipse cx="30" cy="20" rx="3" ry="5" />
        <ellipse cx="25" cy="24" rx="3" ry="5" transform="rotate(-25 25 24)" />
        <ellipse cx="35" cy="24" rx="3" ry="5" transform="rotate(25 35 24)" />
        <ellipse cx="24" cy="30" rx="3" ry="5" transform="rotate(-25 24 30)" />
        <ellipse cx="36" cy="30" rx="3" ry="5" transform="rotate(25 36 30)" />
        <ellipse cx="24" cy="36" rx="3" ry="5" transform="rotate(-25 24 36)" />
        <ellipse cx="36" cy="36" rx="3" ry="5" transform="rotate(25 36 36)" />
      </g>
    </svg>
  ),
  fence: (
    <svg viewBox="0 0 60 60" width="60" height="60" aria-hidden focusable="false">
      <ellipse cx="30" cy="52" rx="22" ry="2" fill="#000" opacity="0.08" />
      <g fill="#a07b3a">
        <polygon points="12,18 16,14 20,18 20,50 12,50" />
        <polygon points="22,18 26,14 30,18 30,50 22,50" />
        <polygon points="32,18 36,14 40,18 40,50 32,50" />
        <polygon points="42,18 46,14 50,18 50,50 42,50" />
      </g>
      <rect x="10" y="26" width="42" height="3" fill="#7a5a25" />
      <rect x="10" y="38" width="42" height="3" fill="#7a5a25" />
    </svg>
  ),
  magnifier: (
    <svg viewBox="0 0 60 60" width="60" height="60" aria-hidden focusable="false">
      <ellipse cx="30" cy="52" rx="20" ry="2" fill="#000" opacity="0.08" />
      <circle cx="26" cy="26" r="14" fill="#fff7e6" stroke="#7a5a25" strokeWidth="2.5" />
      <circle cx="22" cy="22" r="4" fill="#ffd97a" opacity="0.7" />
      <rect x="36" y="36" width="14" height="4" rx="2" fill="#7a5a25" transform="rotate(45 43 38)" />
    </svg>
  ),
}

export function EmptyArt({ name }: { name: EmptyArtName }) {
  return <span className="empty-state__art">{ART[name]}</span>
}
