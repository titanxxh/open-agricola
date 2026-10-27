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

export function RoomInvitePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { apiFetch } = useAuth()
  const { t } = useLocale()
  const listId = useId()
  const [result, setResult] = useState<SearchResult>({ phase: 'idle' })
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const prefix = /[^\s,，;；]+$/u.exec(value)?.[0] ?? ''
  const selectedIds = value.slice(0, value.length - prefix.length).split(/[\s,，;；]+/u)
  const players = result.phase === 'loaded' && result.prefix === prefix
    ? result.players.filter(player => !selectedIds.includes(player.id))
    : []
  const showList = open && prefix.length >= 2 && prefix.length <= 128

  useEffect(() => {
    if (prefix.length < 2 || prefix.length > 128) return
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
  }, [apiFetch, prefix])

  const selectPlayer = (player: InvitablePlayer) => {
    onChange(`${value.slice(0, value.length - prefix.length)}${player.id}, `)
    setActiveIndex(-1)
    setOpen(false)
  }

  return (
    <div className="room-invite-picker">
      <input
        id="invited-player-ids"
        type="text"
        role="combobox"
        value={value}
        onChange={event => { onChange(event.target.value); setActiveIndex(-1); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onPaste={event => {
          const text = event.clipboardData.getData('text')
          if (!/[\r\n]/u.test(text)) return
          event.preventDefault()
          const input = event.currentTarget
          onChange(value.slice(0, input.selectionStart ?? value.length) + text.replace(/[\r\n]+/gu, ', ')
            + value.slice(input.selectionEnd ?? value.length))
          setActiveIndex(-1)
          setOpen(true)
        }}
        onKeyDown={event => {
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
        maxLength={1024}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        aria-describedby="invited-player-ids-hint"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
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
                <code>{player.id}</code>
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
