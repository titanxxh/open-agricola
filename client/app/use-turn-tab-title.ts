import { useEffect } from 'react'

const frames = ['◢ ', '◣ ', '◤ ', '◥ '] as const

export function turnTabTitle(current: string, active: boolean, reducedMotion: boolean): string {
  const prefix = frames.find(frame => current.startsWith(frame))
  const base = prefix ? current.slice(prefix.length) : current
  if (!active) return base
  if (reducedMotion) return `◢ ${base}`
  const index = prefix ? frames.indexOf(prefix) : -1
  return `${frames[(index + 1) % frames.length]!}${base}`
}

export function lobbyNeedsTurnTab(rooms: readonly {
  hotseat: boolean
  player_index: number | null
  waiting_player_indexes: readonly number[]
}[]): boolean {
  return rooms.some(room => !room.hotseat && room.player_index !== null && room.waiting_player_indexes.includes(room.player_index))
}

export function gameNeedsTurnTab(hotseat: boolean, seatIndex: number | null, waitingSeatIndexes: readonly number[]): boolean {
  return seatIndex !== null && !hotseat && waitingSeatIndexes.includes(seatIndex)
}

export function useTurnTabTitle(active: boolean) {
  useEffect(() => {
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null
    let timer = 0
    const stop = () => {
      window.clearInterval(timer)
      timer = 0
    }
    const apply = () => {
      const reduced = media?.matches === true
      document.title = turnTabTitle(document.title, active, reduced)
      stop()
      if (!active || reduced) return
      timer = window.setInterval(() => {
        document.title = turnTabTitle(document.title, true, false)
      }, 1000)
    }
    apply()
    media?.addEventListener?.('change', apply)
    return () => {
      stop()
      media?.removeEventListener?.('change', apply)
      document.title = turnTabTitle(document.title, false, false)
    }
  }, [active])
}
