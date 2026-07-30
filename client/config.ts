export const API_BASE = import.meta.env.VITE_API_BASE || ''  // dev: empty = same-origin
export const WS_BASE = import.meta.env.VITE_WS_BASE ||
  (API_BASE ? API_BASE.replace(/^http/, 'ws') + '/ws' : `ws://${window.location.hostname}:5175/ws`)
// Workshop sandbox executor: 'browser' runs playtests fully in the browser
// (local engine worker), anything else keeps the server sandbox.
export const SANDBOX_EXECUTOR: 'browser' | 'server' =
  import.meta.env.VITE_SANDBOX_EXECUTOR === 'browser' ? 'browser' : 'server'
