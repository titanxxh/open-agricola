import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { setPage } from './PageRouter'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'
import { BrandMark } from '../components/common/BrandMark'
import { Section } from '../components/common/Section'
import { EmptyState } from '../components/common/EmptyState'
import { API_BASE } from '../config'

type RoomSummary = {
  id: string
  playerCount: number
  maxPlayers: number
  createdBy?: string
  status?: 'waiting' | 'playing'
}

type MyRoom = {
  id: string
  status: string
  max_players: number
  updated_at: number
  player_index: number
}

export function LobbyPage() {
  const { user, token, logout } = useAuth()
  const { t } = useLocale()
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [myRooms, setMyRooms] = useState<MyRoom[]>([])
  const [joinRoomId, setJoinRoomId] = useState('')
  const [error, setError] = useState('')
  const [showPlayerSelect, setShowPlayerSelect] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedMaxPlayers, setSelectedMaxPlayers] = useState(2)
  const [draftMode, setDraftMode] = useState<'none' | 'simultaneous'>('none')
  const [draftPoolSize, setDraftPoolSize] = useState<number>(8)
  const [enableCommunityDeck, setEnableCommunityDeck] = useState(false)
  const [enableParentCards, setEnableParentCards] = useState(false)
  const showCommunityDeckToggle = import.meta.env.VITE_ENABLE_COMMUNITY_DECK === 'true'

  const fetchRooms = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/rooms`)
      const data = await resp.json()
      if (data.ok) setRooms(data.rooms)
    } catch { /* silently fail */ }
  }, [])

  const fetchMyRooms = useCallback(async () => {
    if (!token) return
    try {
      const resp = await fetch(`${API_BASE}/api/lobby/my-rooms`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      if (data.ok) setMyRooms(data.rooms)
    } catch { /* silently fail */ }
  }, [token])

  useEffect(() => {
    fetchRooms()
    fetchMyRooms()
    const interval = setInterval(() => { fetchRooms(); fetchMyRooms() }, 5000)
    return () => clearInterval(interval)
  }, [fetchRooms, fetchMyRooms])

  const handleCreateGame = () => {
    const params: Record<string, string> = { transport: 'ws', maxPlayers: String(selectedMaxPlayers) }
    if (draftMode !== 'none') {
      params.draftMode = draftMode
      params.draftPoolSize = String(draftPoolSize)
    }
    if (enableCommunityDeck) {
      params.enableCommunityDeck = 'true'
    }
    if (enableParentCards) {
      params.enableParentCards = 'true'
    }
    setPage('game', params)
  }

  const handleJoinRoom = () => {
    const id = joinRoomId.trim()
    if (!id) { setError(t('platform.pleaseEnterRoomId')); return }
    setPage('game', { transport: 'ws', room: id })
  }

  const handleJoinExisting = (roomId: string) => setPage('game', { transport: 'ws', room: roomId })
  const handleResumeRoom = (roomId: string, playerIndex: number) =>
    setPage('game', { transport: 'ws', room: roomId, player: `p${playerIndex + 1}` })
  const handleDissolveRoom = async (roomId: string) => {
    if (!token) return
    if (!window.confirm(t('platform.dissolveConfirm'))) return
    try {
      await fetch(`${API_BASE}/api/rooms/${roomId}/dissolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      fetchRooms()
      fetchMyRooms()
    } catch { /* ignore */ }
  }

  const handleCopyInviteLink = () => {
    try {
      navigator.clipboard?.writeText(window.location.href)
    } catch { /* ignore */ }
  }

  return (
    <div className="lobby-page">
      <header className="lobby-header">
        <BrandMark
          title={t('platform.lobbyTitle')}
          titleAs="h1"
          className="lobby-brand"
          titleClassName="lobby-title"
        />
        <div className="lobby-header__right">
          <LocaleSwitcher />
          <button
            type="button"
            className="lobby-user-pill"
            onClick={() => setPage('settings')}
            title={t('platform.tabSettings')}
          >
            {user?.displayName || user?.username}
          </button>
          <button type="button" className="btn-link" onClick={logout}>{t('platform.logout')}</button>
        </div>
        <button
          type="button"
          className={`lobby-menu-toggle${menuOpen ? ' is-open' : ''}`}
          aria-expanded={menuOpen}
          aria-controls="lobby-mobile-drawer"
          aria-label={t('platform.tabSettings')}
          onClick={() => setMenuOpen(open => !open)}
        >
          <span aria-hidden />
          <span aria-hidden />
          <span aria-hidden />
        </button>
        {menuOpen && (
          <>
            <div
              className="lobby-drawer__scrim"
              role="presentation"
              onClick={() => setMenuOpen(false)}
            />
            <div className="lobby-drawer" id="lobby-mobile-drawer" role="menu">
              <button
                type="button"
                className="lobby-drawer__item"
                role="menuitem"
                onClick={() => { setMenuOpen(false); setPage('settings') }}
              >
                <span aria-hidden>👤</span>
                {user?.displayName || user?.username}
              </button>
              <div className="lobby-drawer__locale" role="menuitem">
                <LocaleSwitcher />
              </div>
              <button
                type="button"
                className="lobby-drawer__item"
                role="menuitem"
                onClick={() => { setMenuOpen(false); setPage('settings') }}
              >
                <span aria-hidden>⚙️</span>
                {t('platform.tabSettings')}
              </button>
              <button
                type="button"
                className="lobby-drawer__item lobby-drawer__item--danger"
                role="menuitem"
                onClick={() => { setMenuOpen(false); logout() }}
              >
                <span aria-hidden>↪︎</span>
                {t('platform.logout')}
              </button>
            </div>
          </>
        )}
      </header>

      <div className="lobby-grid">
        <Section variant="parchment" icon="🎮" title={t('platform.startGame')} className="lobby-hero">
          {!showPlayerSelect ? (
            <>
              <button
                type="button"
                className="btn-primary lobby-cta-primary"
                onClick={() => setShowPlayerSelect(true)}
              >
                {t('platform.createMultiplayer')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setPage('game')}>
                {t('platform.singlePlayer')}
              </button>
            </>
          ) : (
            <div className="player-select-panel">
              <div className="player-select-label">{t('platform.selectPlayerCount')}</div>
              <div className="player-select-options">
                {([2, 3, 4, 5, 6] as const).map(n => (
                  <button
                    key={n}
                    type="button"
                    className={`player-select-btn${selectedMaxPlayers === n ? ' active' : ''}`}
                    onClick={() => setSelectedMaxPlayers(n)}
                  >
                    {t(`platform.players${n}`)}
                  </button>
                ))}
              </div>
              <div className="player-select-label">{t('platform.draftModeLabel')}</div>
              <div className="player-select-options">
                <button
                  type="button"
                  className={`player-select-btn${draftMode === 'none' ? ' active' : ''}`}
                  onClick={() => setDraftMode('none')}
                >
                  {t('platform.draftModeNone')}
                </button>
                <button
                  type="button"
                  className={`player-select-btn${draftMode === 'simultaneous' ? ' active' : ''}`}
                  onClick={() => setDraftMode('simultaneous')}
                >
                  {t('platform.draftModeSimultaneous')}
                </button>
              </div>
              {draftMode === 'simultaneous' && (
                <>
                  <div className="player-select-label">{t('platform.draftPoolSizeLabel')}</div>
                  <div className="player-select-options">
                    {([7, 8, 9, 10] as const).map(n => (
                      <button
                        key={n}
                        type="button"
                        className={`player-select-btn${draftPoolSize === n ? ' active' : ''}`}
                        onClick={() => setDraftPoolSize(n)}
                      >
                        {t('platform.draftPoolSizeOption', { n: String(n) })}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {showCommunityDeckToggle && (
                <label className="community-deck-toggle">
                  <input
                    type="checkbox"
                    checked={enableCommunityDeck}
                    onChange={(e) => setEnableCommunityDeck(e.target.checked)}
                  />
                  <span>
                    启用社区扩展卡（community deck）
                    <br />
                    <span className="community-deck-toggle-hint">
                      这些卡由玩家通过工坊提交、maintainer review 后合入主仓库。质量 / 平衡性可能与官方卡有差异。
                    </span>
                  </span>
                </label>
              )}
              <label className="community-deck-toggle">
                <input
                  type="checkbox"
                  checked={enableParentCards}
                  onChange={(e) => setEnableParentCards(e.target.checked)}
                />
                <span>启用 Parent Cards 扩展</span>
              </label>
              <div className="player-select-actions">
                <button type="button" className="btn-primary" onClick={handleCreateGame}>
                  {t('platform.createGame')}
                </button>
                <button type="button" className="btn-link" onClick={() => setShowPlayerSelect(false)}>
                  {t('platform.cancel')}
                </button>
              </div>
            </div>
          )}
        </Section>

        <Section variant="parchment" icon="🚪" title={t('platform.joinGame')}>
          <div className="join-form">
            <input
              type="text"
              value={joinRoomId}
              onChange={e => { setJoinRoomId(e.target.value); setError('') }}
              placeholder={t('platform.joinRoomPlaceholder')}
              onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
            />
            <button type="button" className="btn-primary" onClick={handleJoinRoom}>{t('platform.joinBtn')}</button>
          </div>
          {error && <div className="form-error">{error}</div>}
        </Section>

        <Section variant="parchment" icon="🛠️" title={t('platform.workshop')}>
          <button type="button" className="btn-secondary" onClick={() => setPage('workshop')}>
            {t('platform.enterWorkshop')}
          </button>
        </Section>
      </div>

      {myRooms.length > 0 && (
        <Section icon="🎯" title={t('platform.myActiveGames')} variant="default" className="lobby-rooms">
          <ul className="room-list">
            {myRooms.map(r => (
              <li key={r.id} className="room-item">
                <span className="room-id">{t('platform.roomLabel', { id: r.id })}</span>
                <span className="room-players">{t('platform.seatLabel', { index: String(r.player_index + 1) })}</span>
                <span className="room-status" data-status={r.status}>
                  {r.status === 'playing' ? t('platform.statusPlaying') : r.status === 'waiting' ? t('platform.statusWaiting') : r.status}
                </span>
                <button
                  type="button"
                  className="btn-small"
                  onClick={() => handleResumeRoom(r.id, r.player_index)}
                >
                  {t('platform.resume')}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section icon="🏠" title={t('platform.activeRooms')} variant="default" className="lobby-rooms">
        {rooms.length === 0 ? (
          <EmptyState
            art="tractor"
            title={t('platform.noActiveRoomsTitle')}
            description={t('platform.noActiveRoomsDesc')}
            action={
              <button type="button" className="btn-secondary" onClick={handleCopyInviteLink}>
                {t('platform.copyInviteLink')}
              </button>
            }
          />
        ) : (
          <ul className="room-list">
            {rooms.map(room => (
              <li key={room.id} className="room-item">
                <span className="room-id">{t('platform.roomLabel', { id: room.id })}</span>
                <span className="room-players">{t('platform.playerCount', { current: String(room.playerCount), max: String(room.maxPlayers) })}</span>
                <span className="room-status" data-status={room.status}>
                  {room.status === 'playing' ? t('platform.statusPlaying') : t('platform.statusWaiting')}
                </span>
                {room.playerCount < room.maxPlayers && room.createdBy !== user?.id && (
                  <button type="button" className="btn-small" onClick={() => handleJoinExisting(room.id)}>
                    {t('platform.joinBtn')}
                  </button>
                )}
                {room.createdBy === user?.id && room.status === 'waiting' && (
                  <button type="button" className="btn-small btn-danger-small" onClick={() => handleDissolveRoom(room.id)}>
                    {t('platform.dissolveRoom')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="lobby-horizon" aria-hidden>
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none" focusable="false">
          <path
            className="lobby-horizon__hill lobby-horizon__hill--back"
            d="M0,90 C150,60 300,80 450,70 C600,60 750,90 900,80 C1050,72 1150,62 1200,68 L1200,120 L0,120 Z"
          />
          <path
            className="lobby-horizon__hill lobby-horizon__hill--front"
            d="M0,100 C120,82 260,98 400,92 C540,86 680,104 830,96 C980,90 1100,84 1200,90 L1200,120 L0,120 Z"
          />
          <g className="lobby-horizon__grass">
            <path d="M40,108 l3,-10 l3,10 z M48,110 l2,-7 l2,7 z M56,108 l3,-10 l3,10 z" />
            <path d="M310,108 l3,-10 l3,10 z M318,110 l2,-7 l2,7 z M326,108 l3,-10 l3,10 z" />
            <path d="M870,108 l3,-10 l3,10 z M878,110 l2,-7 l2,7 z M886,108 l3,-10 l3,10 z" />
          </g>
          <g className="lobby-horizon__fence">
            <rect x="1048" y="86" width="2" height="22" />
            <rect x="1064" y="84" width="2" height="24" />
            <rect x="1080" y="86" width="2" height="22" />
            <rect x="1096" y="84" width="2" height="24" />
            <rect x="1042" y="92" width="60" height="2" />
            <rect x="1042" y="100" width="60" height="2" />
          </g>
        </svg>
      </div>
    </div>
  )
}
