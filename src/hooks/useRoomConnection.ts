import { useCallback, useEffect, useRef, useState } from 'react'
import { WsGameTransport } from '../services/gameTransport'
import type { GameTransport } from '../services/gameTransport'

export type RoomConnectionState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'connected'; roomId: string; playerIndex: number }
  | { status: 'error'; error: string }

export const useRoomConnection = () => {
  const [connectionState, setConnectionState] = useState<RoomConnectionState>({ status: 'disconnected' })
  const transportRef = useRef<WsGameTransport | null>(null)

  const createRoom = useCallback(async (name?: string, maxPlayers = 2): Promise<GameTransport | null> => {
    setConnectionState({ status: 'connecting' })
    const ws = new WsGameTransport()
    transportRef.current = ws

    return new Promise((resolve) => {
      const origOnMessage = ws['ws']?.onmessage
      ws.connect().then(() => {
        const rawWs = ws['ws']
        if (!rawWs) { setConnectionState({ status: 'error', error: 'no connection' }); resolve(null); return }

        const handler = (event: MessageEvent) => {
          try {
            const msg = JSON.parse(event.data as string)
            if (msg.type === 'roomCreated') {
              setConnectionState({ status: 'connected', roomId: msg.roomId, playerIndex: msg.playerIndex })
              rawWs.removeEventListener('message', handler)
              resolve(ws)
            } else if (msg.type === 'error') {
              setConnectionState({ status: 'error', error: msg.error })
              resolve(null)
            }
          } catch { /* skip non-JSON */ }
        }
        rawWs.addEventListener('message', handler)
        ws.sendRoomCommand('createRoom', { maxPlayers, name: name ?? 'Player 1' })
      }).catch((e) => {
        setConnectionState({ status: 'error', error: String(e) })
        resolve(null)
      })
    })
  }, [])

  const joinRoom = useCallback(async (roomId: string, name?: string): Promise<GameTransport | null> => {
    setConnectionState({ status: 'connecting' })
    const ws = new WsGameTransport()
    transportRef.current = ws

    return new Promise((resolve) => {
      ws.connect().then(() => {
        const rawWs = ws['ws']
        if (!rawWs) { setConnectionState({ status: 'error', error: 'no connection' }); resolve(null); return }

        const handler = (event: MessageEvent) => {
          try {
            const msg = JSON.parse(event.data as string)
            if (msg.type === 'roomJoined') {
              setConnectionState({ status: 'connected', roomId: msg.roomId, playerIndex: msg.playerIndex })
              rawWs.removeEventListener('message', handler)
              resolve(ws)
            } else if (msg.type === 'error') {
              setConnectionState({ status: 'error', error: msg.error })
              resolve(null)
            }
          } catch { /* skip non-JSON */ }
        }
        rawWs.addEventListener('message', handler)
        ws.sendRoomCommand('joinRoom', { roomId, name: name ?? `Player` })
      }).catch((e) => {
        setConnectionState({ status: 'error', error: String(e) })
        resolve(null)
      })
    })
  }, [])

  const disconnect = useCallback(() => {
    if (transportRef.current) {
      transportRef.current.destroy()
      transportRef.current = null
    }
    setConnectionState({ status: 'disconnected' })
  }, [])

  useEffect(() => {
    return () => {
      if (transportRef.current) {
        transportRef.current.destroy()
        transportRef.current = null
      }
    }
  }, [])

  return {
    connectionState,
    createRoom,
    joinRoom,
    disconnect,
    transport: transportRef.current as GameTransport | null,
  }
}
