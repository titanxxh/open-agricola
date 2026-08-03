import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { setPage } from './PageRouter'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'
import { BrandMark } from '../components/common/BrandMark'
import { DonateWidgets } from '../components/common/DonateWidgets'
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
  my_turn: number
}

type RoomWorkshopCard = {
  id: string
  name: string
  card_type: 'minor' | 'occupation'
  author_name: string
}

export function LobbyPage() {
  const { user, logout, apiFetch } = useAuth()
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
  const [workshopCards, setWorkshopCards] = useState<RoomWorkshopCard[]>([])
  const [selectedWorkshopCardIds, setSelectedWorkshopCardIds] = useState<string[]>([])
  const [workshopCardsStatus, setWorkshopCardsStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [enableParentCards, setEnableParentCards] = useState(false)
  const [enableThroughTheSeasons, setEnableThroughTheSeasons] = useState(false)
  const [enableFarmersOfTheMoor, setEnableFarmersOfTheMoor] = useState(false)
  const [allowIncompleteFarmersOfTheMoorMinorDeal, setAllowIncompleteFarmersOfTheMoorMinorDeal] = useState(false)
  const showCommunityDeckToggle = import.meta.env.VITE_ENABLE_COMMUNITY_DECK === 'true'

  const fetchRooms = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/rooms`)
      const data = await resp.json()
      if (data.ok) setRooms(data.rooms)
    } catch { /* silently fail */ }
  }, [])

  const fetchMyRooms = useCallback(async () => {
    if (!user) return
    try {
      const resp = await apiFetch('/api/lobby/my-rooms')
      const data = await resp.json()
      if (data.ok) setMyRooms(data.rooms)
    } catch { /* silently fail */ }
  }, [apiFetch, user])

  useEffect(() => {
    fetchRooms()
    fetchMyRooms()
    const interval = setInterval(() => { fetchRooms(); fetchMyRooms() }, 5000)
    return () => clearInterval(interval)
  }, [fetchRooms, fetchMyRooms])

  useEffect(() => {
    if (!showPlayerSelect || !showCommunityDeckToggle) return
    let cancelled = false
    const load = async () => {
      setWorkshopCardsStatus('loading')
      try {
        const cards: RoomWorkshopCard[] = []
        let page = 1
        let hasMore: boolean
        do {
          const resp = await fetch(`${API_BASE}/api/workshop/cards?scope=room&page=${page}`)
          const data = await resp.json() as { ok: boolean; cards?: RoomWorkshopCard[]; hasMore?: boolean }
          if (!resp.ok || !data.ok || !Array.isArray(data.cards)) throw new Error('Failed to load workshop cards')
          cards.push(...data.cards)
          hasMore = data.hasMore === true
          page += 1
        } while (hasMore)
        if (!cancelled) {
          setWorkshopCards(cards)
          setWorkshopCardsStatus('idle')
        }
      } catch {
        if (!cancelled) setWorkshopCardsStatus('error')
      }
    }
    void load()
    return () => { cancelled = true }
  }, [showPlayerSelect, showCommunityDeckToggle])

  const handleCreateGame = () => {
    const params: Record<string, string> = { transport: 'ws', maxPlayers: String(selectedMaxPlayers) }
    if (draftMode !== 'none') {
      params.draftMode = draftMode
      params.draftPoolSize = String(draftPoolSize)
    }
    if (enableCommunityDeck) {
      params.enableCommunityDeck = 'true'
    }
    if (selectedWorkshopCardIds.length > 0) {
      params.customCards = selectedWorkshopCardIds.join(',')
    }
    if (enableParentCards) {
      params.enableParentCards = 'true'
    }
    if (enableThroughTheSeasons) {
      params.enableThroughTheSeasons = 'true'
    }
    if (enableFarmersOfTheMoor) {
      params.enableFarmersOfTheMoor = 'true'
      if (allowIncompleteFarmersOfTheMoorMinorDeal) {
        params.allowIncompleteFarmersOfTheMoorMinorDeal = 'true'
      }
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
    if (!user) return
    if (!window.confirm(t('platform.dissolveConfirm'))) return
    try {
      await apiFetch(`/api/rooms/${roomId}/dissolve`, {
        method: 'POST',
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
          title="Open Agricola"
          titleAs="h1"
          className="site-home-brand"
          titleClassName="site-home-brand__title"
          homeLinkLabel={t('platform.backToLobbyPlain')}
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
          <button type="button" className="btn-link" onClick={() => { void logout() }}>{t('platform.logout')}</button>
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
                onClick={() => { setMenuOpen(false); void logout() }}
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
                <>
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
                  <div className="room-workshop-picker">
                    <div className="player-select-label">{t('platform.reviewedWorkshopCards')}</div>
                    <div className="community-deck-toggle-hint">{t('platform.reviewedWorkshopCardsHint')}</div>
                    {workshopCardsStatus === 'loading' ? (
                      <div className="room-workshop-picker__status">{t('platform.reviewedWorkshopCardsLoading')}</div>
                    ) : workshopCardsStatus === 'error' ? (
                      <div className="room-workshop-picker__status form-error">{t('platform.reviewedWorkshopCardsError')}</div>
                    ) : workshopCards.length === 0 ? (
                      <div className="room-workshop-picker__status">{t('platform.reviewedWorkshopCardsEmpty')}</div>
                    ) : (
                      <div className="room-workshop-picker__list">
                        {workshopCards.map(card => (
                          <label key={card.id} className="community-deck-toggle">
                            <input
                              type="checkbox"
                              checked={selectedWorkshopCardIds.includes(card.id)}
                              onChange={() => setSelectedWorkshopCardIds(ids => ids.includes(card.id)
                                ? ids.filter(id => id !== card.id)
                                : [...ids, card.id])}
                            />
                            <span>
                              {card.name}
                              <br />
                              <span className="community-deck-toggle-hint">
                                {t(`platform.${card.card_type}`)}{card.author_name ? ` · ${card.author_name}` : ''}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              <label className="community-deck-toggle">
                <input
                  type="checkbox"
                  checked={enableParentCards}
                  onChange={(e) => setEnableParentCards(e.target.checked)}
                />
                <span>启用 Parent Cards 扩展</span>
              </label>
              <label className="community-deck-toggle">
                <input
                  type="checkbox"
                  checked={enableThroughTheSeasons}
                  onChange={(e) => setEnableThroughTheSeasons(e.target.checked)}
                />
                <span>启用 Through the Seasons 扩展</span>
              </label>
              <label className="community-deck-toggle">
                <input
                  type="checkbox"
                  checked={enableFarmersOfTheMoor}
                  onChange={(e) => {
                    setEnableFarmersOfTheMoor(e.target.checked)
                    if (!e.target.checked) setAllowIncompleteFarmersOfTheMoorMinorDeal(false)
                  }}
                />
                <span>启用 Farmers of the Moor 扩展</span>
              </label>
              {enableFarmersOfTheMoor && (
                <label className="community-deck-toggle">
                  <input
                    type="checkbox"
                    checked={allowIncompleteFarmersOfTheMoorMinorDeal}
                    onChange={(e) => setAllowIncompleteFarmersOfTheMoorMinorDeal(e.target.checked)}
                  />
                  <span>允许 Farmers of the Moor 小改良池不完整</span>
                </label>
              )}
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
              <li key={r.id} className={r.my_turn === 1 ? 'room-item room-item--my-turn' : 'room-item'}>
                <span className="room-id">{t('platform.roomLabel', { id: r.id })}</span>
                <span className="room-players">{t('platform.seatLabel', { index: String(r.player_index + 1) })}</span>
                <span className="room-status" data-status={r.my_turn === 1 ? 'my-turn' : r.status}>
                  {r.my_turn === 1 ? t('platform.yourTurn') : r.status === 'playing' ? t('platform.statusPlaying') : r.status === 'waiting' ? t('platform.statusWaiting') : r.status}
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

      <DonateWidgets />
    </div>
  )
}
