import { useEffect, useState, type CSSProperties } from 'react'
import { SelectButton } from '../common/SelectButton'

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
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(max-width: 900px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
    // Older browsers / jsdom fallback
    mq.addListener(handler)
    return () => mq.removeListener(handler)
  }, [])

  if (isMobile) {
    return (
      <SelectButton
        ariaLabel="切换玩家视角"
        className="player-tabs__select"
        value={active}
        onChange={onChange}
        options={players.map((p) => ({
          value: p.id,
          label: `${p.isYou ? '☆ ' : ''}${p.name} · ${p.score ?? 0}`,
        }))}
      />
    )
  }

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
