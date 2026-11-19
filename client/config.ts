export const API_BASE = import.meta.env.VITE_API_BASE || ''
export const WS_BASE = import.meta.env.VITE_WS_BASE ||
  (API_BASE ? API_BASE.replace(/^http/, 'ws') + '/ws'
    : import.meta.env.DEV ? `ws://${window.location.hostname}:5175/ws`
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`)
