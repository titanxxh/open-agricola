const RELOAD_KEY = 'open-agricola:stale-chunk-reload-at'
const RELOAD_WINDOW_MS = 60_000

export function installStaleChunkRecovery() {
  window.addEventListener('vite:preloadError', event => {
    const now = Date.now()
    const lastReload = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (lastReload > 0 && now - lastReload < RELOAD_WINDOW_MS) return

    event.preventDefault()
    window.sessionStorage.setItem(RELOAD_KEY, String(now))
    window.location.reload()
  })
}
