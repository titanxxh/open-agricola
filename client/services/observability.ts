import { API_BASE } from '../config'
import { observationRound, type ObservationRoundState } from '../../shared/contract/observation-round'

type State = ObservationRoundState
const sampled = typeof window !== 'undefined' && Math.random() < 0.1
const received = new WeakMap<object, number>()
const requests = new Map<string, number>()
type BrowserObservation = { kind: string; seconds: number; round: string; outcome: string }
const pending: BrowserObservation[] = []
let flushTimer: ReturnType<typeof setTimeout> | undefined
/** One browser clock, 10% of sessions and at most one upload per second. Never sends game data. */
export function observeBrowser(kind: 'command_rtt' | 'snapshot_commit' | 'connect_ready', start: number, state?: State, outcome = 'ok') {
  if (!sampled || pending.length >= 10) return
  pending.push({ kind, seconds: (performance.now() - start) / 1000, round: observationRound(state), outcome })
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = undefined
    const body = JSON.stringify(pending.splice(0))
    void fetch(`${API_BASE}/api/observability/telemetry`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {})
  }, 1000)
}
export const markRequest = (id: string) => { if (sampled) { if (requests.size >= 100) requests.clear(); requests.set(id, performance.now()) } }
export function responseReceived(id: string | undefined, state?: State, outcome = 'ok') {
  if (!id) return
  const start = requests.get(id)
  requests.delete(id)
  if (start !== undefined) observeBrowser('command_rtt', start, state, outcome)
}
export const snapshotReceived = (state: object) => { if (sampled) received.set(state, performance.now()) }
export const transferSnapshotObservation = (raw: object, hydrated: object) => { const start = received.get(raw); if (start !== undefined) received.set(hydrated, start) }
export const snapshotCommitted = (state: State) => { const start = received.get(state); received.delete(state); if (start !== undefined) observeBrowser('snapshot_commit', start, state) }
