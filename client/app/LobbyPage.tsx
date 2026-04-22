import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { setPage } from './PageRouter'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'
import { BrandMark } from '../components/common/BrandMark'
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
  const [selectedMaxPlayers, setSelectedMaxPlayers] = useState(2)
  const [draftMode, setDraftMode] = useState<'none' | 'simultaneous'>('none')
  const [draftPoolSize, setDraftPoolSize] = useState<number>(8)
  const [enableCommunityDeck, setEnableCommunityDeck] = useState(false)
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

  return (
    <div className="lobby-page">
      <div className="lobby-header">
        <BrandMark
          title={t('platform.lobbyTitle')}
          titleAs="h1"
          className="lobby-brand"
          titleClassName="lobby-title"
        />
        <div className="lobby-user-info">
          <LocaleSwitcher />
          <button type="button" className="btn-link" onClick={() => setPage('settings')}>
            {user?.displayName || user?.username}
          </button>
          <button type="button" className="btn-link" onClick={logout}>{t('platform.logout')}</button>
        </div>
      </div>

      <div className="lobby-content">
        <div className="lobby-actions">
          <div className="lobby-section">
            <h2>{t('platform.startGame')}</h2>
            {!showPlayerSelect ? (
              <>
                <button type="button" className="btn-primary" onClick={() => setShowPlayerSelect(true)}>
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
                  {([2, 3, 4] as const).map(n => (
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
          </div>

          <div className="lobby-section">
            <h2>{t('platform.joinGame')}</h2>
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
          </div>

          <div className="lobby-section">
            <h2>{t('platform.workshop')}</h2>
            <button type="button" className="btn-secondary" onClick={() => setPage('workshop')}>
              {t('platform.enterWorkshop')}
            </button>
          </div>
        </div>

        {myRooms.length > 0 && (
          <div className="lobby-rooms">
            <h2>{t('platform.myActiveGames')}</h2>
            <ul className="room-list">
              {myRooms.map(r => (
                <li key={r.id} className="room-item">
                  <span className="room-id">{t('platform.roomLabel', { id: r.id })}</span>
                  <span className="room-players">{t('platform.seatLabel', { index: String(r.player_index + 1) })}</span>
                  <span className="room-status">
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
          </div>
        )}

        <div className="lobby-rooms">
          <h2>{t('platform.activeRooms')}</h2>
          {rooms.length === 0 ? (
            <p className="rooms-empty">{t('platform.noActiveRooms')}</p>
          ) : (
            <ul className="room-list">
              {rooms.map(room => (
                <li key={room.id} className="room-item">
                  <span className="room-id">{t('platform.roomLabel', { id: room.id })}</span>
                  <span className="room-players">{t('platform.playerCount', { current: String(room.playerCount), max: String(room.maxPlayers) })}</span>
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
        </div>
      </div>
    </div>
  )
}
