import { useSyncExternalStore } from 'react'
import { API_BASE } from '../config'

/**
 * Whether the game server answers (#1816). While the formal backend is down, Caddy answers every API request with 503
 * `server_unavailable`, and a closed pre gateway answers `prerelease_maintenance`. A request the browser cannot read at
 * all counts as unavailable only while this frontend's own origin still answers; otherwise this device is `offline`.
 * No maintenance window or expected recovery time is known here: maintenance and an outage look the same.
 */
export type ServerAvailability = 'unknown' | 'up' | 'unavailable' | 'offline'

export const SERVER_RETRY_MS = 15_000
const PROBE_TIMEOUT_MS = 5_000
const UNAVAILABLE_STATUSES = new Set([502, 503, 504])
const UNAVAILABLE_CODES = new Set(['server_unavailable', 'prerelease_maintenance'])

/** An API error body that means the server, not the request, is unavailable. */
export const isServerUnavailableCode = (code: unknown): boolean => typeof code === 'string' && UNAVAILABLE_CODES.has(code)
export const isServerUnavailableStatus = (status: number): boolean => UNAVAILABLE_STATUSES.has(status)

let status: ServerAvailability = 'unknown'
let probe: Promise<ServerAvailability> | null = null
let retry: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()
const recoveries = new Set<() => void>()
// A navigation cancels the leaving page's requests, which then fail like an unreachable server; that page asks nothing.
let leaving = false
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { leaving = true })
  window.addEventListener('pageshow', () => { leaving = false })
}

function publish(next: ServerAvailability) {
  const recovered = (status === 'unavailable' || status === 'offline') && next === 'up'
  status = next
  listeners.forEach(listener => listener())
  if (recovered) recoveries.forEach(recovery => recovery())
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try { return await fetch(url, { ...init, signal: controller.signal }) } finally { clearTimeout(timer) }
}

/** One health probe, classified; never throws. A plain GET without credentials needs no CORS preflight. */
export async function probeServer(): Promise<ServerAvailability> {
  try {
    const response = await timedFetch(`${API_BASE}/api/health`, { credentials: 'omit', cache: 'no-store' })
    return isServerUnavailableStatus(response.status) ? 'unavailable' : 'up'
  } catch {
    // Unreadable: is it the server or this device's connection? This frontend's own origin decides; any answer counts.
    try {
      await timedFetch(`${import.meta.env.BASE_URL}frontend-build.json?availability=${Date.now()}`, { cache: 'no-store' })
      return 'unavailable'
    } catch { return 'offline' }
  }
}

function scheduleRetry() {
  if (retry) return
  retry = setTimeout(() => { retry = null; void checkServerAvailability() }, SERVER_RETRY_MS)
}

/** Probes now (sharing a probe already running) and keeps probing every 15 s until the server answers again. */
export function checkServerAvailability(): Promise<ServerAvailability> {
  if (leaving) return Promise.resolve(status)
  probe ??= probeServer().then(result => {
    probe = null
    publish(result)
    if (result === 'up') { if (retry) clearTimeout(retry); retry = null }
    else scheduleRetry()
    return result
  })
  return probe
}

/** An immediate probe, replacing the pending 15 s retry. */
export function retryServerNow(): Promise<ServerAvailability> {
  if (retry) { clearTimeout(retry); retry = null }
  return checkServerAvailability()
}

/** Runs `recovery` each time an unavailable or offline server answers again. */
export function onServerRecovered(recovery: () => void): () => void {
  recoveries.add(recovery)
  return () => { recoveries.delete(recovery) }
}

export const getServerAvailability = (): ServerAvailability => status

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useServerAvailability(): ServerAvailability {
  return useSyncExternalStore(subscribe, getServerAvailability, getServerAvailability)
}
