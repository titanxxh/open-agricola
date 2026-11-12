const sandboxQuery = '?page=game&player=p1&embedded=1&devMode=1'

export function workshopGameUrl(local: boolean, fresh: boolean): string {
  return `${import.meta.env.BASE_URL}workshop-game.html${sandboxQuery}${local ? '&localSandbox=1' : ''}${local && fresh ? '&freshSandbox=1' : ''}`
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
    for (const [key, value] of new URLSearchParams(sandboxQuery)) {
      if (params.get(key) !== value) return false
    }
    const local = params.has('localSandbox')
    const fresh = params.has('freshSandbox')
    if (local && params.get('localSandbox') !== '1') return false
    if (fresh && (!local || params.get('freshSandbox') !== '1')) return false
    return params.size === 4 + Number(local) + Number(fresh)
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
