import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { getDb } from '../../db'
import { createOperationsHandler } from '../../observability/http'
import { recordingResources } from '../../__tests__/_helpers/recording'
import { PostgresRoomPersistence } from '../../game/persistence/postgres-adapter'
import { createWsServer } from '../ws-server'

vi.mock('../../db', async () => {
  const { createTestDatabase } = await import('../../__tests__/_helpers/postgres')
  const database = await createTestDatabase()
  return { getDb: () => database }
})

const db = getDb()
const handler = createOperationsHandler({ db })
const server = createServer((req, res) => { void handler(req, res) })
let backend: Awaited<ReturnType<typeof createWsServer>>
let recording: Awaited<ReturnType<typeof recordingResources>>
let base: string
let peer: WebSocket | undefined
beforeAll(async () => {
  vi.stubEnv('ALLOW_ANONYMOUS_WS', 'true')
  vi.stubEnv('OBSERVABILITY_METRICS_TOKEN', 'ws-scrape-token')
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  recording = await recordingResources(db)
  backend = await createWsServer(server, { persistence: new PostgresRoomPersistence(db), ...recording })
  const room = backend.registry.get('dev2')!
  for (const player of room.session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  room.session.devSetRound(8)
  room.session.updatePlayerName(0, '农夫🧑‍🌾')
})
afterAll(async () => {
  if (peer) peer.terminate()
  await backend?.shutdown()
  await new Promise<void>(done => server.close(() => done()))
  await recording?.close()
  await db.close()
  vi.unstubAllEnvs()
})

it('measures real returned UTF-8 envelopes using the round displayed by each message', async () => {
  const scrape = async () => (await fetch(base + '/internal/metrics', { headers: { Authorization: 'Bearer ws-scrape-token' } })).text()
  const statistic = (text: string, suffix: string) => text.split('\n')
    .filter(line => line.startsWith('agricola_ws_outgoing_message_size_bytes_' + suffix + '{') && line.includes('round="8"') && line.includes('message_type="state"'))
    .reduce((sum, line) => sum + Number(line.slice(line.lastIndexOf(' ') + 1)), 0)
  const before = await scrape()
  const sizes: number[] = []
  const texts: string[] = []
  peer = new WebSocket(base.replace('http:', 'ws:') + '/ws')
  const reply = new Promise<void>((resolve, reject) => {
    peer!.on('error', reject)
    peer!.on('message', raw => {
      const text = raw.toString()
      const event = JSON.parse(text)
      if (event.type !== 'stateUpdate') return
      expect(event.payload.state.round).toBe(8)
      sizes.push(raw instanceof Buffer ? raw.length : Buffer.concat(raw as Buffer[]).length)
      texts.push(text)
      if (event.requestId === 'round-eight') resolve()
    })
    peer!.once('open', () => peer!.send(JSON.stringify({ type: 'joinRoom', roomId: 'dev2', requestedPlayerIndex: 0, requestId: 'round-eight' })))
  })
  await reply
  peer!.removeAllListeners('message')
  const after = await scrape()
  expect(statistic(after, 'count') - statistic(before, 'count')).toBe(sizes.length)
  expect(statistic(after, 'sum') - statistic(before, 'sum')).toBe(sizes.reduce((sum, size) => sum + size, 0))
  expect(sizes[0]).toBeGreaterThan(texts[0]!.length)
  expect(after).not.toContain('农夫')
  expect(after).not.toContain('dev2')
})

it('counts per-viewer fanout once and follows new rounds, duplicate receipts and undo snapshots', async () => {
  const second = new WebSocket(base.replace('http:', 'ws:') + '/ws')
  const replies: { socket: WebSocket; event: any; bytes: number }[] = []
  const wait = (socket: WebSocket, match: (event: any) => boolean) => new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off('message', receive); reject(new Error('WS observation timed out')) }, 5000)
    const receive = (raw: Buffer) => { const event = JSON.parse(raw.toString()); if (match(event)) { clearTimeout(timeout); socket.off('message', receive); resolve(event) } }
    socket.on('message', receive)
  })
  const recordFirst = (raw: Buffer) => replies.push({ socket: peer!, event: JSON.parse(raw.toString()), bytes: raw.length })
  const recordSecond = (raw: Buffer) => replies.push({ socket: second, event: JSON.parse(raw.toString()), bytes: raw.length })
  peer!.on('message', recordFirst); second.on('message', recordSecond)
  try {
    const joined = wait(second, e => e.type === 'stateUpdate' && e.requestId === 'second-viewer')
    await new Promise<void>(done => second.once('open', done))
    second.send(JSON.stringify({ type: 'joinRoom', roomId: 'dev2', requestedPlayerIndex: 1, requestId: 'second-viewer' }))
    await joined
    const scopePromise = wait(peer!, e => e.type === 'commandScope')
    peer!.send(JSON.stringify({ type: 'getCommandScope', requestId: 'metrics-scope' }))
    const { scope } = await scopePromise
    const statePromise = wait(peer!, e => e.type === 'stateUpdate' && e.requestId === 'baseline')
    peer!.send(JSON.stringify({ type: 'getState', requestId: 'baseline' }))
    let state = await statePromise
    const scrape = async () => (await fetch(base + '/internal/metrics', { headers: { Authorization: 'Bearer ws-scrape-token' } })).text()
    const value = (text: string, family: string, labels: string[]) => text.split('\n').filter(line => line.startsWith(family + '{') && labels.every(label => line.includes(label)))
      .reduce((sum, line) => sum + Number(line.slice(line.lastIndexOf(' ') + 1)), 0)
    const before = await scrape()
    replies.length = 0
    const command = { type: 'devSetRound', round: 9, requestId: 'advance-round', commandContext: { scopeId: scope.scopeId, commandId: crypto.randomUUID(), roomId: 'dev2', expectedVersion: state.version, inputWindowId: state.inputWindow?.id } }
    const first = wait(peer!, e => e.type === 'stateUpdate' && e.requestId === command.requestId)
    const other = wait(second, e => e.type === 'stateUpdate' && e.payload.state.round === 9)
    peer!.send(JSON.stringify(command))
    state = await first; await other
    const states = replies.filter(reply => reply.event.type === 'stateUpdate' && reply.event.payload.state.round === 9)
    expect(states).toHaveLength(2)
    expect(states[0]!.event.payload.state.players).not.toEqual(states[1]!.event.payload.state.players)
    const after = await scrape()
    const bytes = states.reduce((sum, reply) => sum + reply.bytes, 0)
    expect(value(after, 'agricola_ws_outgoing_message_size_bytes_sum', ['round="9"','message_type="state"']) - value(before, 'agricola_ws_outgoing_message_size_bytes_sum', ['round="9"','message_type="state"'])).toBe(bytes)
    expect(value(after, 'agricola_ws_broadcast_payload_bytes_sum', ['round="9"']) - value(before, 'agricola_ws_broadcast_payload_bytes_sum', ['round="9"'])).toBe(bytes)
    expect(value(after, 'agricola_ws_broadcast_recipients_sum', ['round="9"']) - value(before, 'agricola_ws_broadcast_recipients_sum', ['round="9"'])).toBe(2)
    const duplicate = wait(peer!, e => e.type === 'commandReceipt' && e.requestId === 'duplicate')
    peer!.send(JSON.stringify({ ...command, requestId: 'duplicate' }))
    expect((await duplicate).status).toBe('completed')
    const duplicateMetrics = await scrape()
    expect(value(duplicateMetrics, 'agricola_commit_attempts_total', ['outcome="committed"'])).toBe(value(after, 'agricola_commit_attempts_total', ['outcome="committed"']))
    const undo = wait(peer!, e => e.type === 'stateUpdate' && e.requestId === 'undo-round')
    peer!.send(JSON.stringify({ type: 'undoStep', requestId: 'undo-round', commandContext: { scopeId: scope.scopeId, commandId: crypto.randomUUID(), roomId: 'dev2', expectedVersion: state.version, inputWindowId: state.inputWindow?.id } }))
    const result = await undo
    expect(result.payload.state.round).toBeGreaterThanOrEqual(1)
    expect(await scrape()).toContain(`round="${result.payload.state.round}"`)
  } finally { peer!.off('message', recordFirst); second.terminate() }
}, 15_000)

it('keeps draft/parent selection distinct from playing rounds and classifies endgame and malformed contexts', async () => {
  const { GameSession } = await import('../../game/authoritative-session')
  const room = backend.registry.get('dev2')!
  const previous = room.session
  const cases = [
    { session: new GameSession(961, undefined, { playerCount: 2, draftMode: 'simultaneous' }), tag: 'pregame', phase: 'draft' },
    { session: new GameSession(961, undefined, { playerCount: 2, enableParentCards: true, draftParents: true }), tag: 'pregame', phase: 'parent-selection' },
    { session: new GameSession(961, undefined, { playerCount: 2 }), round: 14, tag: '14', phase: 'playing' },
    { session: new GameSession(961, undefined, { playerCount: 2 }), round: 15, tag: 'postgame', phase: 'playing' },
    { session: new GameSession(961, undefined, { playerCount: 2 }), round: 99, tag: 'unknown', phase: 'playing' },
  ]
  const scrape = async () => (await fetch(base + '/internal/metrics', { headers: { Authorization: 'Bearer ws-scrape-token' } })).text()
  const count = (text: string, round: string) => text.split('\n').filter(line => line.startsWith('agricola_ws_outgoing_message_size_bytes_count{') && line.includes(`round="${round}"`) && line.includes('message_type="state"'))
    .reduce((sum, line) => sum + Number(line.slice(line.lastIndexOf(' ') + 1)), 0)
  try {
    for (const [index, fixture] of cases.entries()) {
      room.session = fixture.session
      if (fixture.round) fixture.session.devSetRound(fixture.round)
      const before = count(await scrape(), fixture.tag)
      const requestId = `classification-${index}`
      const response = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { peer!.off('message', receive); reject(new Error('Missing classified snapshot')) }, 5000)
        const receive = (raw: Buffer) => {
          const event = JSON.parse(raw.toString())
          if (event.type !== 'stateUpdate' || event.requestId !== requestId) return
          clearTimeout(timer); peer!.off('message', receive)
          expect(event.payload.state.phase).toBe(fixture.phase)
          if (fixture.round) expect(event.payload.state.round).toBe(fixture.round)
          resolve()
        }
        peer!.on('message', receive)
      })
      peer!.send(JSON.stringify({ type: 'getState', requestId }))
      await response
      expect(count(await scrape(), fixture.tag)).toBe(before + 1)
    }
  } finally { room.session = previous; for (const fixture of cases) fixture.session.dispose() }
})
