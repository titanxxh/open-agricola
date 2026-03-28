import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { setPage } from './PageRouter'

const backendHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
const API_BASE = import.meta.env.VITE_API_BASE || `http://${backendHost}:5175`

type RoomSummary = {
  id: string
  playerCount: number
  maxPlayers: number
}

export function LobbyPage() {
  const { user, logout } = useAuth()
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [joinRoomId, setJoinRoomId] = useState('')
  const [error, setError] = useState('')

  const fetchRooms = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/rooms`)
      const data = await resp.json()
      if (data.ok) setRooms(data.rooms)
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => {
    fetchRooms()
    const interval = setInterval(fetchRooms, 5000)
    return () => clearInterval(interval)
  }, [fetchRooms])

  const handleCreateGame = () => {
    setPage('game', { transport: 'ws' })
  }

  const handleJoinRoom = () => {
    const id = joinRoomId.trim()
    if (!id) {
      setError('请输入房间 ID')
      return
    }
    setPage('game', { transport: 'ws', room: id })
  }

  const handleJoinExisting = (roomId: string) => {
    setPage('game', { transport: 'ws', room: roomId })
  }

  const handleSinglePlayer = () => {
    setPage('game')
  }

  const handleWorkshop = () => {
    setPage('workshop')
  }

  return (
    <div className="lobby-page">
      <div className="lobby-header">
        <h1>Open Agricola</h1>
        <div className="lobby-user-info">
          <span>{user?.displayName || user?.username}</span>
          <button type="button" className="btn-link" onClick={logout}>登出</button>
        </div>
      </div>

      <div className="lobby-content">
        <div className="lobby-actions">
          <div className="lobby-section">
            <h2>开始游戏</h2>
            <button type="button" className="btn-primary" onClick={handleCreateGame}>
              创建多人游戏
            </button>
            <button type="button" className="btn-secondary" onClick={handleSinglePlayer}>
              单人模式
            </button>
          </div>

          <div className="lobby-section">
            <h2>加入游戏</h2>
            <div className="join-form">
              <input
                type="text"
                value={joinRoomId}
                onChange={e => { setJoinRoomId(e.target.value); setError('') }}
                placeholder="输入房间 ID"
                onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
              />
              <button type="button" className="btn-primary" onClick={handleJoinRoom}>
                加入
              </button>
            </div>
            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="lobby-section">
            <h2>工坊</h2>
            <button type="button" className="btn-secondary" onClick={handleWorkshop}>
              进入卡牌工坊
            </button>
          </div>
        </div>

        <div className="lobby-rooms">
          <h2>当前房间</h2>
          {rooms.length === 0 ? (
            <p className="rooms-empty">暂无活跃房间</p>
          ) : (
            <ul className="room-list">
              {rooms.map(room => (
                <li key={room.id} className="room-item">
                  <span className="room-id">房间 {room.id}</span>
                  <span className="room-players">{room.playerCount}/{room.maxPlayers} 玩家</span>
                  {room.playerCount < room.maxPlayers && (
                    <button
                      type="button"
                      className="btn-small"
                      onClick={() => handleJoinExisting(room.id)}
                    >
                      加入
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
