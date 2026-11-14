import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, expect, it, vi } from 'vitest'
import { liveSmokeBrowserGuard, LIVE_READ_COMMANDS, permitsLiveSmokeRequest } from '../release/live-smoke-guard'
import { liveDiagnosticMetadata, parseLiveSmokeConfig, readPrivateAcceptanceFile } from '../release/live-smoke'
import { liveSmokeCli } from '../release/live-smoke-cli'

const apiOrigin = 'https://api.agricola.test', roomId = 'retained-participant-room'
const roots: string[] = []
const root = () => { const path = mkdtempSync(join(tmpdir(), 'live-smoke-test-')); roots.push(path); return path }
afterEach(() => { vi.restoreAllMocks(); for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }) })
const config = () => ({ format: 1, appUrl: 'https://app.agricola.test/', apiUrl: apiOrigin, expectedBuild: 'a'.repeat(40),
  credentialsFile: '/private/credentials.env', inventoryFile: '/private/inventory.json', artifactDirectory: '/private/pages', outputDirectory: '/private/attempt' })

it('permits only the selected existing room locate body and rejects every creation/recovery mutation shape', () => {
  const request = (body: unknown, overrides = {}) => permitsLiveSmokeRequest({ apiOrigin, url: `${apiOrigin}/api/rooms/locate`, method: 'POST', body, participantRoomId: roomId, ...overrides })
  expect(request({ roomId })).toBe(true)
  for (const body of [null, [], {}, { roomId: 'other-room' }, { allocationId: 'new-game' }, { roomId, pendingIdentity: {} }, { roomId, developmentSlot: true }, { roomId, extra: false }]) expect(request(body)).toBe(false)
  expect(request({ roomId }, { participantRoomId: null })).toBe(false)
  expect(request({ roomId }, { method: 'DELETE' })).toBe(false)
  expect(request({ roomId }, { url: `${apiOrigin}/api/game/action` })).toBe(false)
  expect(request({ roomId }, { url: 'https://foreign.agricola.test/api/rooms/locate' })).toBe(false)
  expect(request({ roomId }, { url: `${apiOrigin}/api/rooms/locate?allocationId=x` })).toBe(false)
  expect(request({}, { url: `${apiOrigin}/api/auth/logout-all` })).toBe(false)
  expect(request({}, { url: `${apiOrigin}/api/auth/logout` })).toBe(true)
})

it('runs the actual browser guard: normal reads reach native send, gameplay/other-room/foreign sockets never do', () => {
  const sent: unknown[] = [], connections: string[] = [], blocked: string[] = []
  class NativeSocket {
    static OPEN = 1
    constructor(url: string) { connections.push(url) }
    send(value: unknown) { sent.push(value) }
  }
  const window = { WebSocket: NativeSocket, __oaLiveSmokeRoom: roomId,
    __oaLiveSmokeBlocked: () => blocked.push('blocked'), __oaLiveSmokeSent: () => {} }
  const sandbox = { window, URL, location: { href: 'https://app.agricola.test/' }, settings: { apiOrigin, readTypes: LIVE_READ_COMMANDS } }
  runInNewContext(`(${liveSmokeBrowserGuard.toString()})(settings)`, sandbox)
  const send = (command: unknown) => runInNewContext(`new window.WebSocket('wss://api.agricola.test/nodes/instance-one/ws','oa.browser.v2').send(${JSON.stringify(JSON.stringify(command))})`, sandbox)
  send({ type: 'getCommandScope' }); send({ type: 'joinRoom', roomId, intent: 'resume' }); send({ type: 'joinRoom', roomId, intent: 'join' }); send({ type: 'quoteFenceSelection', payload: { edges: [] } })
  expect(sent.map(value => JSON.parse(String(value)).type)).toEqual(['getCommandScope', 'joinRoom', 'joinRoom', 'quoteFenceSelection'])
  for (const command of [{ type: 'createRoom' }, { type: 'choice', value: 'confirm' }, { type: 'joinRoom', roomId, intent: 'unknown' }, { type: 'joinRoom', roomId: 'other-room', intent: 'resume' }]) expect(() => send(command)).toThrow('blocked')
  const before = connections.length
  expect(() => runInNewContext("new window.WebSocket('wss://foreign.agricola.test/nodes/a/ws')", sandbox)).toThrow('blocked')
  expect(connections).toHaveLength(before)
  expect(sent).toHaveLength(4); expect(blocked).toHaveLength(5)
  for (const extra of [{ allocationId: 'new' }, { pendingIdentity: {} }, { developmentSlot: true }, { commandContext: {} }]) {
    expect(() => send({ type: 'joinRoom', roomId, intent: 'join', ...extra })).toThrow('blocked')
  }
  expect(sent).toHaveLength(4)
  send({ type: 'joinRoom', roomId, intent: 'join', name: 'Existing participant', requestedPlayerIndex: 0, requestId: 'read-request' })
  expect(sent).toHaveLength(5)
  expect(window.WebSocket.OPEN).toBe(1)
})

it('requires private nofollow bounded owner files', () => {
  const directory = root(), file = join(directory, 'input.json'), link = join(directory, 'link.json')
  writeFileSync(file, 'private', { mode: 0o600 })
  expect(readPrivateAcceptanceFile(file)).toBe('private')
  expect(() => readPrivateAcceptanceFile(file, 2)).toThrow()
  symlinkSync(file, link); expect(() => readPrivateAcceptanceFile(link)).toThrow()
  chmodSync(file, 0o644); expect(() => readPrivateAcceptanceFile(file)).toThrow('private owner file')
})

it('plan validates configuration without opening any credential/inventory/artifact file', async () => {
  const directory = root(), file = join(directory, 'config.json')
  writeFileSync(file, JSON.stringify(config()), { mode: 0o600 })
  const output: string[] = []; vi.spyOn(console, 'log').mockImplementation(value => { output.push(String(value)) })
  await liveSmokeCli(['--config', file])
  expect(JSON.parse(output[0]!)).toMatchObject({ status: 'plan-only', credentialValuesRead: false, gameWritesPermitted: false })
  expect(() => parseLiveSmokeConfig({ ...config(), password: 'must-not-be-a-config-value' })).toThrow('configuration fields')
  expect(() => parseLiveSmokeConfig({ ...config(), apiUrl: 'http://api.agricola.test' })).toThrow('HTTPS')
})

it('live diagnostic output keeps transport categories and omits room ids, paths, names and raw values', () => {
  const safe = liveDiagnosticMetadata({ dropped: 0, entries: [
    { kind: 'socket-open', sequence: 1, at: 2, pageId: 3, documentId: 4, socketId: 5, origin: apiOrigin, path: '/private-room' },
    { kind: 'frame', sequence: 2, at: 3, pageId: 3, documentId: 4, socketId: 5, direction: 'received', messageType: 'stateUpdate', sync: 'snapshot', roomId: 'private-room', playerIndex: 1 },
  ] })
  expect(safe.entries).toEqual([
    { kind: 'socket-open', sequence: 1, at: 2, pageId: 3, documentId: 4, socketId: 5 },
    { kind: 'frame', sequence: 2, at: 3, pageId: 3, documentId: 4, socketId: 5, direction: 'received', messageType: 'stateUpdate', sync: 'snapshot', joinIntent: undefined },
  ])
  expect(JSON.stringify(safe)).not.toMatch(/private-room|api.agricola|playerIndex/)
})
