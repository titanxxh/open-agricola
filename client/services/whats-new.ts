import { useSyncExternalStore } from 'react'
import { API_BASE } from '../config'
import { parseWhatsNew, type WhatsNewRelease } from '../../shared/contract/whats-new'

const SEEN_STORAGE_KEY = 'open-agricola-whats-new-seen-v1'

type WhatsNewSnapshot = Readonly<{ releases: readonly WhatsNewRelease[]; seenVersion: string | null }>

function readSeenVersion() {
  try { return window.localStorage.getItem(SEEN_STORAGE_KEY) } catch { return null }
}

let snapshot: WhatsNewSnapshot = { releases: [], seenVersion: readSeenVersion() }
let request: Promise<void> | null = null
const listeners = new Set<() => void>()

function publish(next: WhatsNewSnapshot) {
  snapshot = next
  listeners.forEach(listener => listener())
}

/**
 * One request per page load. No notes file (404) keeps the button hidden for the page;
 * other failures also hide it but let a later mount retry.
 */
function load() {
  request ??= fetch(`${API_BASE}/api/whats-new`)
    .then(async response => {
      if (response.status === 404) return
      if (!response.ok) throw new Error(`What's New unavailable (${response.status})`)
      publish({ ...snapshot, releases: parseWhatsNew(await response.json()).releases })
    })
    .catch(() => { request = null })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  load()
  return () => { listeners.delete(listener) }
}

export function useWhatsNew() {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
}

/** Records the newest release as read so the unread dot clears in every header on the page. */
export function markWhatsNewSeen() {
  const latest = snapshot.releases[0]?.version
  if (!latest || latest === snapshot.seenVersion) return
  try { window.localStorage.setItem(SEEN_STORAGE_KEY, latest) } catch { /* the dot returns next visit */ }
  publish({ ...snapshot, seenVersion: latest })
}

/**
 * Releases listed above the last one read. A first visit marks only the newest release;
 * a read version that has aged out of the list marks every listed release.
 */
export function unseenWhatsNewVersions(releases: readonly WhatsNewRelease[], seenVersion: string | null): ReadonlySet<string> {
  if (releases.length === 0) return new Set()
  if (seenVersion === null) return new Set([releases[0].version])
  const index = releases.findIndex(release => release.version === seenVersion)
  return new Set((index === -1 ? releases : releases.slice(0, index)).map(release => release.version))
}
