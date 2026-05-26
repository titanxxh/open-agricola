import type { ReactNode } from 'react'
import { BrandMark } from './BrandMark'

type GameLoadScreenProps = {
  percent: number
  label: string
  children?: ReactNode
}

export function GameLoadScreen({ percent, label, children }: GameLoadScreenProps) {
  const clamped = Math.min(100, Math.max(0, percent))

  return (
    <div className="ws-status-screen">
      <div className="ws-status-card">
        <BrandMark
          title="Open Agricola"
          titleAs="h2"
          className="brand-mark-centered ws-status-brand"
          titleClassName="ws-status-title"
        />
        <div className="ws-status-text">{label}</div>
        <div
          className="game-load-progress"
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        >
          <div className="game-load-progress-fill" style={{ width: `${clamped}%` }} />
        </div>
        {children}
      </div>
    </div>
  )
}
