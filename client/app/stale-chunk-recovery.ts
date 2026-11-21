const RELOAD_KEY = 'open-agricola:stale-chunk-reload-at'
const RELOAD_WINDOW_MS = 60_000

export function installStaleChunkRecovery() {
  // Leaving the page cancels its pending chunk loads, and Safari reports those as preload errors. Reloading then
  // would replace the navigation the user started, so a page that is unloading leaves them alone.
  let leaving = false
  window.addEventListener('beforeunload', () => { leaving = true })
  window.addEventListener('pageshow', () => { leaving = false })

  window.addEventListener('vite:preloadError', event => {
    if (leaving) return
    const now = Date.now()
    const lastReload = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (lastReload > 0 && now - lastReload < RELOAD_WINDOW_MS) return

    event.preventDefault()
    window.sessionStorage.setItem(RELOAD_KEY, String(now))
    window.location.reload()
  })
}
