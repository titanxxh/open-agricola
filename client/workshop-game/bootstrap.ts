function sandboxQuery(local: boolean, fresh: boolean, parentSearch: string): string {
  const parent = new URLSearchParams(parentSearch)
  const developmentPlayer = (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_AUTH_SHORTCUTS === '1')
    && parent.get('page') === 'workshop' && parent.get('player') === 'p1' && parent.get('devMode') === '1'
  const player = !local || developmentPlayer ? '&player=p1' : ''
  return `?page=game${player}&embedded=1&devMode=1${local ? '&localSandbox=1' : ''}${local && fresh ? '&freshSandbox=1' : ''}`
}

export function workshopGameUrl(local: boolean, fresh: boolean): string {
  return `${import.meta.env.BASE_URL}workshop-game.html${sandboxQuery(local, fresh, window.location.search)}`
}

function isWorkshopGame(): boolean {
  try {
    if (window.parent === window || window.parent !== window.top) return false
    const own = new URL(window.location.href)
    const base = new URL(import.meta.env.BASE_URL, own.origin)
    const parent = new URL(window.parent.location.href)
    if (parent.origin !== own.origin) return false
    if (parent.pathname !== base.pathname && parent.pathname !== `${base.pathname}index.html`) return false
    if (parent.searchParams.getAll('page').length !== 1 || parent.searchParams.get('page') !== 'workshop') return false
    if (own.pathname !== `${base.pathname}workshop-game.html` || own.hash) return false
    const params = own.searchParams
    const expected = new URLSearchParams(sandboxQuery(params.has('localSandbox'), params.has('freshSandbox'), parent.search))
    if (params.size !== expected.size) return false
    for (const [key, value] of expected) {
      if (params.get(key) !== value) return false
    }
    return true
  } catch {
    return false
  }
}

export function showStandaloneLink(root: HTMLElement): void {
  const link = document.createElement('a')
  link.textContent = 'Open Agricola'
  link.href = new URL(import.meta.env.BASE_URL, window.location.origin).href
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  root.replaceChildren(link)
}

export async function startWorkshopGame(root: HTMLElement, start: () => Promise<void>): Promise<void> {
  if (!isWorkshopGame()) {
    showStandaloneLink(root)
    return
  }
  await start()
}
