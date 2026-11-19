const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isDevRoomId = (roomId: string): boolean => {
  const prefix = roomId.slice(0, 4)
  return /^dev[2-6]$/.test(prefix)
    && (roomId === prefix || (roomId[4] === '-' && UUID_PATTERN.test(roomId.slice(5))))
}

export const roomIdFromQuery = (search: string | URLSearchParams): string | null => {
  const params = new URLSearchParams(search)
  return params.get('context') ?? params.get('room')
}

export function gameContextLinkFromQuery(search: string) {
  const params = new URLSearchParams(search)
  const roomId = roomIdFromQuery(params)
  if (roomId === null || isDevRoomId(roomId) || (params.has('page') && params.get('page') !== 'game')) return null
  return { roomId, participantOnly: params.has('context') }
}

export function buildRoomSearch(roomId: string, search = ''): string {
  const current = new URLSearchParams(search)
  if (isDevRoomId(roomId)
    || (current.get('hotseat') === '1' && current.get('devMode') === '1' && current.has('player'))) {
    current.delete('context')
    current.set('room', roomId)
    return `?${current}`
  }
  const params = new URLSearchParams({ room: roomId })
  for (const key of ['bg', 'step', 'frame', 'perspective', 'layout', 'bugReport', 'bugReportConnection']) {
    const value = current.get(key)
    if (value !== null) params.set(key, value)
  }
  return `?${params}`
}

export const isDevModeAllowedFromQuery = (search: string): boolean => {
  const params = new URLSearchParams(search)
  if (params.get('devMode') !== '1') return false
  const page = params.get('page')
  const roomId = params.get('room')
  if (
    (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_AUTH_SHORTCUTS === '1') &&
    page === 'game' && params.get('transport') === 'ws' &&
    params.get('hotseat') === '1' && params.has('player')
  ) return true
  if (!page) {
    if (params.get('transport') === 'ws' || roomId) return !!roomId && isDevRoomId(roomId)
    return true
  }
  if (page === 'lobby' || page === 'workshop') return true
  if (roomId && isDevRoomId(roomId)) return true
  return params.get('embedded') === '1' && params.get('transport') !== 'ws'
}
