export const API_BASE = import.meta.env.VITE_API_BASE || ''  // dev: empty = same-origin
export const WS_BASE = import.meta.env.VITE_WS_BASE ||
  (API_BASE ? API_BASE.replace(/^http/, 'ws') + '/ws' : `ws://${window.location.hostname}:5175/ws`)
