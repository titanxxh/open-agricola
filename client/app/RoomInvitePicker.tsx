import { useEffect, useId, useState } from 'react'
import type { InvitablePlayer } from '../../shared/contract/room-access'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'

type SearchResult =
  | { phase: 'idle' }
  | { phase: 'loaded'; prefix: string; players: InvitablePlayer[] }
  | { phase: 'failed'; prefix: string }

const isInvitablePlayer = (value: unknown): value is InvitablePlayer =>
  !!value && typeof value === 'object'
  && 'id' in value && typeof value.id === 'string'
  && 'username' in value && typeof value.username === 'string'
  && 'displayName' in value && typeof value.displayName === 'string'

export function RoomInvitePicker({ value, onChange }: { value: InvitablePlayer[]; onChange: (value: InvitablePlayer[]) => void }) {
  const { apiFetch } = useAuth()
  const { t } = useLocale()
  const listId = useId()
  const [result, setResult] = useState<SearchResult>({ phase: 'idle' })
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [query, setQuery] = useState('')
  const [composing, setComposing] = useState(false)
  const prefix = query.trim()
  const players = result.phase === 'loaded' && result.prefix === prefix
    ? result.players.filter(player => !value.some(selected => selected.id === player.id))
    : []
  const showList = open && !composing && prefix.length >= 2 && prefix.length <= 128

  useEffect(() => {
    if (composing || prefix.length < 2 || prefix.length > 128) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const search = async () => {
        try {
          const response = await apiFetch(`/api/lobby/players?prefix=${encodeURIComponent(prefix)}`, { signal: controller.signal })
          const body: unknown = await response.json()
          if (!response.ok || !body || typeof body !== 'object' || !('players' in body)
            || !Array.isArray(body.players) || !body.players.every(isInvitablePlayer)) throw new Error('player search failed')
          if (!controller.signal.aborted) setResult({ phase: 'loaded', prefix, players: body.players })
        } catch {
          if (!controller.signal.aborted) setResult({ phase: 'failed', prefix })
        }
      }
      void search()
    }, 200)
    return () => { clearTimeout(timer); controller.abort() }
  }, [apiFetch, prefix, composing])

  const selectPlayer = (player: InvitablePlayer) => {
    onChange([...value, player])
    setQuery('')
    setActiveIndex(-1)
    setOpen(false)
  }

  return (
    <div className="room-invite-picker">
      {value.length > 0 && (
        <div className="room-invite-selected">
          {value.map(player => (
            <span key={player.id} className="room-invite-chip">
              <span>{player.displayName} <small>@{player.username}</small></span>
              <button type="button" aria-label={`${t('platform.remove')} ${player.displayName}`}
                onClick={() => onChange(value.filter(selected => selected.id !== player.id))}>×</button>
            </span>
          ))}
        </div>
      )}
      <input
        id="invited-players"
        type="text"
        role="combobox"
        value={query}
        onChange={event => { setQuery(event.target.value); setActiveIndex(-1); setOpen(true) }}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || composing) return
          if (event.key === 'Escape') { setOpen(false); return }
          if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && players.length) {
            event.preventDefault()
            setOpen(true)
            setActiveIndex(index => event.key === 'ArrowDown' ? (index + 1) % players.length : (index <= 0 ? players.length : index) - 1)
          }
          if (event.key === 'Enter' && showList && players.length) {
            event.preventDefault()
            const player = players[Math.max(0, activeIndex)]
            if (player) selectPlayer(player)
          }
        }}
        maxLength={128}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        aria-describedby="invited-players-hint"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList && players[activeIndex] ? `${listId}-${activeIndex}` : undefined}
      />
      {showList && (
        <div className="room-invite-suggestions">
          <ul id={listId} role="listbox" aria-label={t('platform.invitedPlayerMatches')}>
            {players.map((player, index) => (
              <li
                key={player.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onPointerDown={event => event.preventDefault()}
                onClick={() => selectPlayer(player)}
              >
                <span>{player.displayName} <small>@{player.username}</small></span>
              </li>
            ))}
          </ul>
          {players.length === 0 && (
            <p role="status">{t(result.phase === 'idle' || result.prefix !== prefix
              ? 'platform.invitedPlayerSearchLoading'
              : result.phase === 'failed' ? 'platform.invitedPlayerSearchFailed' : 'platform.invitedPlayerSearchEmpty')}</p>
          )}
        </div>
      )}
    </div>
  )
}
