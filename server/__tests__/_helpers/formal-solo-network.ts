import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'
import type { PostgresDatabase } from '../../database/postgres'
import type { ClientCommand, ServerEvent } from '../../../shared/contract/protocol/ws'
import type { StateUpdateEnvelope } from '../../../shared/contract/protocol/game'
import { S3ObjectStore, objectHash } from '../../storage/s3-store'
import { ResourceStore } from '../../storage/resource-store'
import { ReplayResources } from '../../storage/replay-resources'
import { getTestDatabaseUrl } from './postgres'
import { testStorageEnvironment } from './objects'

export class SoloNetworkPeer {
  readonly events: ServerEvent[] = []
  private constructor(readonly socket: WebSocket) {
    socket.on('message', raw => {
      const event: ServerEvent = JSON.parse(raw.toString())
      this.events.push(event)
    })
  }

  static async connect(url: string, cookie: string): Promise<SoloNetworkPeer> {
    const peer = new SoloNetworkPeer(new WebSocket(url, { headers: { Cookie: cookie } }))
    await once(peer.socket, 'open')
    return peer
  }

  async wait<T extends ServerEvent>(predicate: (event: ServerEvent) => event is T): Promise<T> {
    const existing = this.events.find(predicate)
    if (existing) return existing
    return new Promise((resolve, reject) => {
      const finish = () => {
        const event = this.events.find(predicate)
        if (!event) return
        clearTimeout(timer)
        this.socket.off('message', finish)
        resolve(event)
      }
      const timer = setTimeout(() => {
        this.socket.off('message', finish)
        reject(new Error(`WebSocket event timed out: ${JSON.stringify(this.events.map(event => ({
          type: event.type, ...('error' in event ? { error: event.error } : {}),
          ...('requestId' in event ? { requestId: event.requestId } : {}),
        })))}`))
      }, 8_000)
      this.socket.on('message', finish)
    })
  }

  async prepare(command: ClientCommand, state?: StateUpdateEnvelope, allocationId?: string) {
    const scopeRequest = randomUUID()
    this.socket.send(JSON.stringify({ type: 'getCommandScope', requestId: scopeRequest }))
    const scope = await this.wait((event): event is Extract<ServerEvent, { type: 'commandScope' }> =>
      event.type === 'commandScope' && event.requestId === scopeRequest)
    const identity = { scopeId: scope.scope.scopeId, commandId: randomUUID(),
      ...(allocationId ? { allocationId } : {}),
      ...(state ? { roomId: state.roomId, expectedVersion: state.version, inputWindowId: state.inputWindow?.id } : {}),
    }
    const requestId = randomUUID()
    return { identity, requestId, command: { ...command, requestId, commandContext: identity } }
  }

  async mutate(command: ClientCommand, state?: StateUpdateEnvelope, allocationId?: string) {
    const prepared = await this.prepare(command, state, allocationId)
    this.socket.send(JSON.stringify(prepared.command))
    const receipt = await this.wait((event): event is Extract<ServerEvent, { type: 'commandReceipt' }> =>
      event.type === 'commandReceipt' && event.requestId === prepared.requestId)
    if (receipt.status !== 'completed' || !receipt.receipt.outcome.ok) throw new Error(`Command rejected: ${JSON.stringify(receipt)}`)
    const next = await this.wait((event): event is StateUpdateEnvelope => event.type === 'stateUpdate'
      && event.roomId === receipt.receipt.outcome.roomId && event.version === receipt.receipt.outcome.roomVersion)
    return { identity: prepared.identity, receipt: receipt.receipt, state: next }
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return
    const closed = once(this.socket, 'close')
    this.socket.close()
    await closed
  }
}

/** Keep this owner alive across service rebuilds; close only after recovery assertions. */
export async function createFormalSoloRecording(db: PostgresDatabase) {
  const storage = testStorageEnvironment()
  const prefix = `test/solo-matrix-${randomUUID()}/`
  const objects = S3ObjectStore.fromEnv(storage, prefix)
  const resources = new ResourceStore(db, objects)
  const replay = new ReplayResources(resources)
  const html = Buffer.from('<main>Standard solo network acceptance</main>')
  const manifest = Buffer.from(JSON.stringify({ entrypoint: 'index.html', files: { 'index.html': objectHash(html) } }))
  const buildId = objectHash(manifest)
  try {
    await resources.stage(`replay-viewers/${buildId}/index.html`, html, 'text/html')
    await replay.publishViewer(buildId, manifest)
    return { environment: storage, prefix, buildId, resources: replay,
      close: async () => { try { await objects.clearPrefix() } finally { objects.close() } },
    }
  } catch (error) {
    try { await objects.clearPrefix() } finally { objects.close() }
    throw error
  }
}

/** A real backend process with one private PG schema and one private S3 prefix. */
export async function startFormalSoloBackend(db: PostgresDatabase) {
  const schema = await db.prepare('SELECT current_schema() AS name').get<{ name: string }>()
  if (!schema?.name.startsWith('test_')) throw new Error('Formal acceptance requires a private test schema')
  const recording = await createFormalSoloRecording(db)
  const { buildId, prefix } = recording
  let backend: ReturnType<typeof spawn> | undefined
  let output = ''
  try {
    const reservation = createServer()
    reservation.listen(0, '127.0.0.1')
    await once(reservation, 'listening')
    const address = reservation.address()
    if (!address || typeof address === 'string') throw new Error('Port reservation failed')
    await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()))
    const baseUrl = `http://127.0.0.1:${address.port}`
    backend = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      env: { ...process.env, ...recording.environment,
        NODE_ENV: 'production', DATABASE_URL: getTestDatabaseUrl(), DATABASE_SCHEMA: schema.name,
        S3_PREFIX: prefix, BACKEND_PORT: String(address.port), BACKEND_HOST: '127.0.0.1',
        INSTANCE_INTERNAL_URL: baseUrl, PUBLIC_APP_ORIGIN: baseUrl,
        REPLAY_VIEWER_BUILD_ID: buildId, GAME_BUILD_ID: 'standard-solo-network-acceptance',
        ALLOW_ANONYMOUS_WS: 'false', DISABLE_RATE_LIMIT: '1', WORKSHOP_PR_ENABLED: 'false', BUG_REPORTS_ENABLED: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const child = backend
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Backend startup timed out: ${output}`)), 20_000)
      const receive = (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-32_768)
        if (!output.includes('Server listening on')) return
        clearTimeout(timer)
        resolve()
      }
      child.stdout?.on('data', receive)
      child.stderr?.on('data', receive)
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Backend exited ${code}: ${output}`)) })
    })
    const readiness = await fetch(`${baseUrl}/api/health`)
    if (!readiness.ok) throw new Error(`Backend not ready: ${await readiness.text()}`)
    return {
      baseUrl, buildId, schema: schema.name, prefix, processId: child.pid,
      output: () => output,
      close: async () => {
        try { await stop(child) } finally { await recording.close() }
      },
    }
  } catch (error) {
    try { if (backend) await stop(backend) } finally { await recording.close() }
    throw error
  }
}

async function stop(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const stopped = once(child, 'exit')
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 10_000)
  try {
    const [, signal] = await stopped
    if (signal === 'SIGKILL') throw new Error('Acceptance backend did not shut down gracefully')
  } finally { clearTimeout(timer) }
}
