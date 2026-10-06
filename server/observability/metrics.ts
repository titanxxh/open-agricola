import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client'
import type { WebSocket } from 'ws'
import type { GameState } from '../../shared/contract/types'
import type { ServerEvent } from '../../shared/contract/protocol/ws'

const SECONDS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15, 60]
const BYTES = [1024, 4096, 16384, 32768, 65536, 131072, 262144, 524288, 1048576, 4194304]
const COMMANDS = new Set(['action', 'specialAction', 'choice', 'anytime', 'roundEnd', 'commitSelection', 'parentSubmit', 'undoStep', 'undoAction', 'newGame', 'createRoom', 'joinRoom', 'getState', 'getHistory', 'draftSubmit', 'loadGame', 'ordinaryDrawKeep'])
export const commandTag = (value: string): string => COMMANDS.has(value) ? value : 'other'
export type RoundState = Pick<GameState, 'round' | 'phase' | 'gameOver'>
export function roundTag(state?: RoundState): string {
  if (!state) return 'none'
  if (state.gameOver || (state.phase === 'playing' && state.round === 15)) return 'postgame'
  if (state.phase === 'draft' || state.phase === 'parent-selection') return 'pregame'
  return Number.isInteger(state.round) && state.round >= 1 && state.round <= 14 ? String(state.round) : 'unknown'
}
export type Operation = 'queue' | 'preflight' | 'rule' | 'commit' | 'snapshot' | 'encode' | 'persist' | 'publication' | 'projection' | 'send' | 'json' | 'db_query' | 'db_pool_wait' | 'db_transaction' | 's3_get' | 's3_put' | 's3_delete'
type CommandObservation = { command: string; requestId?: string; socket: WebSocket; start: number; round: string; outcome: string; responded: boolean }
const commands = new AsyncLocalStorage<CommandObservation>()
export const safe = (observe: () => void): void => { try { observe() } catch { /* Observability cannot change a game outcome. */ } }

/** Numeric aggregates only; protected payloads and arbitrary identity labels never enter this registry. */
export class OperationsMetrics {
  readonly registry = new Registry()
  private initialized = false
  private readonly httpResponses = new WeakSet<ServerResponse>()
  readonly httpRequests = new Counter({ name: 'agricola_http_requests_total', help: 'HTTP responses by bounded route, method and status.', labelNames: ['route', 'method', 'status'], registers: [this.registry] })
  readonly httpDuration = new Histogram({ name: 'agricola_http_request_duration_seconds', help: 'Request reception to response finish, excluding network delivery.', labelNames: ['route', 'method', 'status'], buckets: SECONDS, registers: [this.registry] })
  readonly operationDuration = new Histogram({ name: 'agricola_operation_duration_seconds', help: 'Wall clock duration at the named server boundary; overlapping stages are not additive.', labelNames: ['stage', 'outcome'], buckets: SECONDS, registers: [this.registry] })
  readonly commandAttempts = new Counter({ name: 'agricola_commands_total', help: 'Command attempts, with rule rejections separate from system errors and duplicates.', labelNames: ['command', 'outcome'], registers: [this.registry] })
  readonly commandDuration = new Histogram({ name: 'agricola_command_duration_seconds', help: 'Parsed command dispatch through final local response/publication and receipt.', labelNames: ['command', 'outcome'], buckets: SECONDS, registers: [this.registry] })
  readonly responseDuration = new Histogram({ name: 'agricola_command_response_duration_seconds', help: 'Parsed command reception to first correlated local response enqueue.', labelNames: ['command'], buckets: SECONDS, registers: [this.registry] })
  readonly ruleDuration = new Histogram({ name: 'agricola_rule_duration_seconds', help: 'GameSession execution through SessionResponse, including required Worker waits.', labelNames: ['command', 'mode'], buckets: SECONDS, registers: [this.registry] })
  readonly outgoingSize = new Histogram({ name: 'agricola_ws_outgoing_message_size_bytes', help: 'UTF-8 bytes of each locally enqueued complete JSON message, before transport compression/framing.', labelNames: ['round', 'message_type'], buckets: BYTES, registers: [this.registry] })
  readonly broadcastSize = new Histogram({ name: 'agricola_ws_broadcast_payload_bytes', help: 'Sum of actual per-recipient JSON payload bytes for one publication.', labelNames: ['round'], buckets: BYTES, registers: [this.registry] })
  readonly broadcastRecipients = new Histogram({ name: 'agricola_ws_broadcast_recipients', help: 'Actual open socket sends in one publication.', labelNames: ['round'], buckets: [1, 2, 3, 4, 5, 6], registers: [this.registry] })
  readonly dbErrors = new Counter({ name: 'agricola_db_errors_total', help: 'Database failures by bounded category; contains no SQL.', labelNames: ['reason'], registers: [this.registry] })
  readonly s3Bytes = new Counter({ name: 'agricola_s3_payload_bytes_total', help: 'Successful object payload bytes, excluding protocol overhead.', labelNames: ['kind'], registers: [this.registry] })
  readonly workerFailures = new Counter({ name: 'agricola_worker_failures_total', help: 'Worker timeouts and execution failures.', labelNames: ['kind'], registers: [this.registry] })
  readonly socketErrors = new Counter({ name: 'agricola_ws_errors_total', help: 'WebSocket send, parse and disconnect failures by bounded reason.', labelNames: ['kind'], registers: [this.registry] })
  readonly incomingBytes = new Counter({ name: 'agricola_ws_incoming_payload_bytes_total', help: 'Received WebSocket application payload bytes.', registers: [this.registry] })
  readonly queueDepth = new Gauge({ name: 'agricola_queue_pending', help: 'Work items waiting for their predecessor; includes lifecycle work.', registers: [this.registry] })
  readonly queuedAt = new Gauge({ name: 'agricola_queue_oldest_enqueued_unixtime', help: 'Oldest pending work timestamp; zero when the queue is empty.', registers: [this.registry] })
  readonly payloadSize = new Histogram({ name: 'agricola_persistence_payload_bytes', help: 'Confirmed snapshot body/reference JSON or encoded Replay gzip bytes; excludes WAL/physical IO.', labelNames: ['kind'], buckets: BYTES, registers: [this.registry] })
  readonly commitResults = new Counter({ name: 'agricola_commit_attempts_total', help: 'Durable commit attempts by bounded result; retries are separate attempts.', labelNames: ['outcome'], registers: [this.registry] })
  readonly logicalBytes = new Counter({ name: 'agricola_persistence_payload_bytes_total', help: 'Confirmed logical payload bytes by representation, not physical disk writes.', labelNames: ['kind'], registers: [this.registry] })
  readonly data = new Gauge({ name: 'agricola_platform', help: 'Bounded current platform gauges; use collector freshness before interpreting a value.', labelNames: ['kind'], registers: [this.registry] })
  readonly collectorSuccess = new Gauge({ name: 'agricola_collector_last_success_unixtime', help: 'Last successful complete observation by source; absent before first success.', labelNames: ['source'], registers: [this.registry] })
  readonly collectorErrors = new Counter({ name: 'agricola_collector_errors_total', help: 'Collection failures by bounded source.', labelNames: ['source'], registers: [this.registry] })
  readonly clientDuration = new Histogram({ name: 'agricola_client_duration_seconds', help: 'Sampled, untrusted browser observations using one browser monotonic clock.', labelNames: ['kind', 'round', 'outcome'], buckets: SECONDS, registers: [this.registry] })
  readonly clientEvents = new Counter({ name: 'agricola_client_events_total', help: 'Sampled browser timeout, reconnect and connection events.', labelNames: ['kind'], registers: [this.registry] })

  initialize(role: 'app' | 'ingress'): void {
    if (this.initialized) return
    this.initialized = true
    this.registry.setDefaultLabels({ role, slot: process.env.INSTANCE_SLOT ?? '0' })
    collectDefaultMetrics({ register: this.registry, prefix: 'agricola_', eventLoopMonitoringPrecision: 20 })
  }

  http(req: IncomingMessage, res: ServerResponse): void {
    safe(() => this.observeHttp(req, res))
  }

  private observeHttp(req: IncomingMessage, res: ServerResponse): void {
    if (this.httpResponses.has(res)) return
    this.httpResponses.add(res)
    const start = performance.now()
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    const route = path.startsWith('/ops/') || path.startsWith('/api/admin/observability') ? 'operations'
      : path.startsWith('/internal/metrics') ? 'metrics' : path === '/api/health' ? 'health'
      : path.startsWith('/api/auth/') ? 'auth' : path.startsWith('/api/rooms') ? 'rooms'
      : path.startsWith('/api/v1/game-contexts') ? 'contexts' : path.startsWith('/api/workshop') ? 'workshop'
      : path.startsWith('/replay-') || path.startsWith('/api/v1/replays') ? 'replay' : 'other'
    const method = ['GET', 'POST', 'HEAD', 'OPTIONS', 'DELETE', 'PUT'].includes(req.method ?? '') ? req.method! : 'OTHER'
    let finished = false
    const finish = (status: string) => {
      if (finished) return
      finished = true
      safe(() => {
        this.httpRequests.inc({ route, method, status })
        this.httpDuration.observe({ route, method, status }, (performance.now() - start) / 1000)
      })
    }
    res.once('finish', () => finish(String(res.statusCode)))
    res.once('close', () => { if (!res.writableFinished) finish('aborted') })
  }
}

export const operationsMetrics = new OperationsMetrics()

export function measure<T>(stage: Operation, work: () => T): T {
  const start = performance.now()
  const finish = (outcome: string) => safe(() => {
    operationsMetrics.operationDuration.observe({ stage, outcome }, (performance.now() - start) / 1000)
    if (stage.startsWith('s3_') && outcome === 'ok') operationsMetrics.collectorSuccess.set({ source: 's3' }, Date.now() / 1000)
  })
  try {
    const result = work()
    if (result instanceof Promise) {
      return result.then(value => { finish('ok'); return value }, error => { finish('error'); throw error }) as T
    }
    finish('ok')
    return result
  } catch (error) { finish('error'); throw error }
}

export function commandOutcome(outcome: 'ok' | 'rule_rejected' | 'duplicate' | 'stale' | 'blocked' | 'error' | 'canceled'): void {
  const observation = commands.getStore()
  if (observation) observation.outcome = outcome
}

export async function observeCommand(meta: { command: string; requestId?: string; socket: WebSocket; round: string }, work: () => Promise<void>): Promise<void> {
  const observation: CommandObservation = { ...meta, command: commandTag(meta.command), start: performance.now(), outcome: 'ok', responded: false }
  await commands.run(observation, async () => {
    try { await work() } catch (error) { observation.outcome = 'error'; throw error }
    finally {
      safe(() => {
        operationsMetrics.commandAttempts.inc({ command: observation.command, outcome: observation.outcome })
        operationsMetrics.commandDuration.observe({ command: observation.command, outcome: observation.outcome }, (performance.now() - observation.start) / 1000)
      })
    }
  })
}

const messageTag = (event: ServerEvent): string => event.type === 'stateUpdate' ? 'state'
  : event.type === 'commandReceipt' ? 'receipt' : event.type === 'historyPage' ? 'history'
  : event.type === 'error' ? 'error' : 'event'

/** Called at the actual send boundary, once per encoded recipient message. */
export function sendObserved(ws: WebSocket, event: ServerEvent, capturedRound = commands.getStore()?.round ?? 'none', encodedMessage?: string): number {
  if (ws.readyState !== ws.OPEN) return 0
  const round = event.type === 'stateUpdate' ? roundTag(event.payload.state) : capturedRound
  const encoded = encodedMessage ?? measure('json', () => JSON.stringify(event))
  const bytes = Buffer.byteLength(encoded, 'utf8')
  try { measure('send', () => ws.send(encoded)) } catch (error) { safe(() => operationsMetrics.socketErrors.inc({ kind: 'send' })); throw error }
  safe(() => operationsMetrics.outgoingSize.observe({ round, message_type: messageTag(event) }, bytes))
  const command = commands.getStore()
  if (command && !command.responded && command.socket === ws && command.requestId && 'requestId' in event && event.requestId === command.requestId) {
    command.responded = true
    safe(() => operationsMetrics.responseDuration.observe({ command: command.command }, (performance.now() - command.start) / 1000))
  }
  return bytes
}

export function measureRule<T>(mode: 'native' | 'worker', work: () => T): T {
  const start = performance.now()
  const command = commands.getStore()?.command ?? 'other'
  const finish = () => safe(() => operationsMetrics.ruleDuration.observe({ command, mode }, (performance.now() - start) / 1000))
  try {
    const result = work()
    if (result instanceof Promise) return result.finally(finish) as T
    finish(); return result
  } catch (error) { finish(); throw error }
}

export function startObservation(stage: Operation): (outcome?: string) => void {
  const start = performance.now()
  let finished = false
  return (outcome = 'ok') => {
    if (finished) return
    finished = true
    safe(() => operationsMetrics.operationDuration.observe({ stage, outcome }, (performance.now() - start) / 1000))
  }
}

export function observeDatabaseError(error: unknown): void {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  const reason = code === '40P01' ? 'deadlock' : code === '57014' ? 'timeout' : code === '53300' ? 'connection_limit'
    : /^(08|ECONN|ETIMEDOUT|EPIPE)/.test(code) ? 'unavailable' : 'query'
  safe(() => operationsMetrics.dbErrors.inc({ reason }))
}
