import type { CSSProperties } from 'react'

export interface PlayerSummary {
  id: string
  name: string
  score?: number
  color?: string
  isYou?: boolean
  isCurrent?: boolean
}

interface Props {
  players: PlayerSummary[]
  active: string
  onChange: (id: string) => void
}

export function PlayerTabs({ players, active, onChange }: Props) {
  return (
    <div role="tablist" className="player-tabs">
      {players.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          data-player={p.id}
          aria-selected={p.id === active}
          className={[
            'player-tabs__tab',
            p.id === active && 'is-active',
            p.isCurrent && 'is-current-turn',
            p.isYou && 'is-you',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChange(p.id)}
          style={p.color ? ({ '--player-color': p.color } as CSSProperties) : undefined}
        >
          <span className="player-tabs__avatar" aria-hidden>
            {p.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="player-tabs__name">
            {p.isYou && <span aria-label="you">☆</span>} {p.name}
          </span>
          {p.score !== undefined && <span className="player-tabs__score">{p.score}</span>}
        </button>
      ))}
    </div>
  )
}
