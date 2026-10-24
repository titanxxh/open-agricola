const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isDevRoomId = (roomId: string): boolean => {
  const prefix = roomId.slice(0, 4)
  return /^dev[2-6]$/.test(prefix)
    && (roomId === prefix || (roomId[4] === '-' && UUID_PATTERN.test(roomId.slice(5))))
}

export const roomIdFromQuery = (search: string): string | null => {
  const params = new URLSearchParams(search)
  return params.get('context') ?? params.get('room')
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
