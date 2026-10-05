import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createServer as createNetServer } from 'node:net'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { vi, afterEach, describe, expect, it } from 'vitest'

// Native database/S3 and child-process operations also run under full-suite load.
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 })
import { parseEnv } from 'node:util'
import { createTestDatabase, getTestDatabaseUrl } from '../../server/__tests__/_helpers/postgres'
import { sendCommand } from '../../server/__tests__/_helpers/command-socket'
import WebSocket from 'ws'
import { GameSession } from '../../server/game/authoritative-session'
import { serializeSessionSnapshot } from '../../shared/session/serialization'
import { encodeRoomBody } from '../../server/game/persistence/room-body-codec'
import type { ClientCommand, ServerEvent } from '../../shared/contract/protocol/ws'

const scriptPath = resolve(import.meta.dirname, '../../restart-local.sh')
const tempDirs: string[] = []
const processGroups: number[] = []

const reservePort = async (): Promise<number> => {
  const server = createNetServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to reserve a local port')
  const port = address.port
  server.close()
  await once(server, 'close')
  return port
}

const sendWsCommand = <T>(ws: WebSocket, command: ClientCommand): Promise<T> =>
  new Promise((resolvePromise, reject) => {
    const requestId = command.requestId ?? `restart-${Date.now()}-${Math.random()}`
    const timer = setTimeout(() => {
      ws.off('message', onMessage)
      reject(new Error(`Timed out waiting for ${command.type}`))
    }, 15_000)
    const onMessage = (data: WebSocket.RawData) => {
      const event = JSON.parse(data.toString()) as ServerEvent
      if (!('requestId' in event) || event.requestId !== requestId) return
      if (event.type !== 'stateUpdate' && event.type !== 'error') return
      clearTimeout(timer)
      ws.off('message', onMessage)
      if (event.type === 'error') reject(new Error(event.error))
      else resolvePromise(event.payload as T)
    }
    ws.on('message', onMessage)
    void sendCommand(ws as WebSocket & { received: ServerEvent[] }, { ...command, requestId }).catch(error => { clearTimeout(timer); ws.off('message', onMessage); reject(error) })
  })

const writeExecutable = (path: string, contents: string): void => {
  writeFileSync(path, contents)
  chmodSync(path, 0o755)
}

// Launcher process tests replace the external dependency boundary alongside pnpm.
const writeServicesStub = (root: string): void => {
  mkdirSync(join(root, 'scripts'), { recursive: true })
  writeFileSync(join(root, 'scripts/local-services.mjs'), `
    import { mkdirSync, writeFileSync } from 'node:fs'
    import { join } from 'node:path'
    mkdirSync(process.env.SHARED_DATA_DIR, { recursive: true })
    writeFileSync(join(process.env.SHARED_DATA_DIR, 'dependencies.local'), '')
  `)
}

const waitForFile = async (path: string): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(path)) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`Timed out waiting for ${path}`)
}

const processGroupExists = (pgid: number): boolean => {
  try {
    process.kill(-pgid, 0)
    return true
  } catch {
    return false
  }
}

afterEach(async () => {
  for (const pgid of processGroups) {
    try {
      process.kill(-pgid, 'SIGKILL')
    } catch {
      continue
    }
  }
  await new Promise(resolve => setTimeout(resolve, 50))
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  processGroups.length = 0
  tempDirs.length = 0
})

describe.each(['raw', 'compressed'] as const)('restart-local saved variant preflight (%s)', (format) => {
  it.each(['parents', 'parents-seasons-moor', 'disabled', 'missing-father'] as const)(
    'reads current %s snapshots without resetting PostgreSQL data', async (mode) => {
      const db = await createTestDatabase()
      try {
        const schema = (await db.prepare('SELECT current_schema() AS schema').get<{ schema: string }>())!.schema
        for (const playerCount of [2, 3, 4, 5, 6]) {
          const session = new GameSession(56125, undefined, {
            playerCount, enableParentCards: mode !== 'disabled', draftParents: false,
            parentSelectionSeed: 9002, enableThroughTheSeasons: mode === 'parents-seasons-moor',
            enableFarmersOfTheMoor: mode === 'parents-seasons-moor', allowIncompleteFarmersOfTheMoorMinorDeal: true,
          })
          for (const player of session.state.players) player.minorHand = player.occupationHand = ['__test_placeholder__']
          if (mode === 'missing-father') session.state.players[0]!.parentCards.father = null
          const json = JSON.stringify(serializeSessionSnapshot(session.state, session))
          const body = format === 'compressed' ? encodeRoomBody(json) : json
          if (format === 'compressed') expect(JSON.parse(body).roomBodyEncoding).toBe('gzip-base64-v1')
          await db.prepare("INSERT INTO rooms(id,state_json,max_players,status,version,custom_card_ids,created_at,updated_at) VALUES(?,?,?,'playing',0,'[]',1,1)").run(`dev${playerCount}`, body, playerCount)
          session.dispose()
        }
        const before = await db.prepare('SELECT * FROM rooms ORDER BY id').all()
        for (let attempt = 0; attempt < 2; attempt++) {
          const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/local-rooms.ts', 'missing-variant', 'direct-parents'], {
            cwd: resolve(import.meta.dirname, '../..'), encoding: 'utf8', timeout: 15000,
            env: { ...process.env, DATABASE_URL: getTestDatabaseUrl(), DATABASE_SCHEMA: schema },
          })
          expect(result.status, result.stderr).toBe(0)
          expect(result.stdout.trim()).toBe(mode === 'disabled' || mode === 'missing-father' ? 'dev2, dev3, dev4, dev5, dev6' : '')
          expect(await db.prepare('SELECT * FROM rooms ORDER BY id').all()).toEqual(before)
        }
      } finally { await db.close() }
    },
  )
})

describe.skipIf(process.platform !== 'linux')('restart-local saved interaction recovery', () => {
  it('preserves a current Parents choice through two real restarts and resumes by public command', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oa-restart-live-'))
    tempDirs.push(root)
    const repository = resolve(import.meta.dirname, '../..')
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/test-environment.ts', 'create', root], { cwd: repository })
    const isolated = parseEnv(readFileSync(join(root, 'test.env'), 'utf8'))
    const backendPort = Number(isolated.BACKEND_PORT), frontendPort = Number(isolated.FRONTEND_PORT)
    const env = { ...process.env, ...isolated, GAME_BUILD_ID: 'test-game', SHARED_OUTPUT_DIR: root }
    const restart = (...args: string[]) => spawnSync('bash', [scriptPath, ...args], {
      cwd: resolve(import.meta.dirname, '../..'),
      encoding: 'utf8',
      input: '',
      timeout: 120_000,
      env,
    })
    const connect = async () => {
      const located = await fetch(`http://127.0.0.1:${backendPort}/api/rooms/locate`, { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${frontendPort}` }, body: JSON.stringify({ roomId: 'dev2' }) })
      const route = await located.json() as { wsPath: string }
      const ws = new WebSocket(`ws://127.0.0.1:${backendPort}${route.wsPath}`, {
        origin: `http://127.0.0.1:${frontendPort}`,
      })
      Object.assign(ws, { received: [] })
      ws.on('message', raw => (ws as WebSocket & { received: ServerEvent[] }).received.push(JSON.parse(raw.toString())))
      await once(ws, 'open')
      await sendWsCommand(ws, { type: 'joinRoom', roomId: 'dev2', requestedPlayerIndex: 0 })
      return ws
    }
    const close = async (ws: WebSocket) => {
      ws.close()
      await once(ws, 'close')
    }

    try {
      const started = restart('--players', '2', '--parents')
      expect(started.status, started.stdout + started.stderr).toBe(0)

      const session = new GameSession(56125, undefined, {
        playerCount: 2,
        enableParentCards: true,
        draftParents: false,
        parentSelectionSeed: 9002,
      })
      for (const player of session.state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
      }
      const player = session.state.players[0]!
      player.parentCards = { mother: 'PR10', father: 'PS07' }
      session.state.players[1]!.parentCards = { mother: 'PR12', father: 'PS03' }
      session.state.round = 4
      player.occupationPlayed = ['A100_Curator', 'A101_CookeryOutfitter', 'A102_Grocer']
      player.resources.grain = 4
      player.fields = [{ row: 0, col: 0, stacks: [] }, { row: 0, col: 1, stacks: [] }]
      expect(session.loadState(session.state).ok).toBe(true)
      expect(session.takeAnytimeAction(0, 'complete-parent-father').ok).toBe(true)
      const pending = session.resolveChoice(0, 'PS07:2')
      expect(pending.interaction).toMatchObject({
        stateId: 'wait',
        playerIndex: 0,
        request: { kind: 'farm-select', farm: { farmType: 'sow', minSelections: 0 } },
      })

      let ws = await connect()
      const loaded = await sendWsCommand<ReturnType<GameSession['getState']>>(ws, {
        type: 'loadGame',
        state: serializeSessionSnapshot(session.state, session),
      })
      await close(ws)

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = restart('--players', '2', '--parents')
        expect(result.status, result.stdout + result.stderr).toBe(0)
        expect(result.stdout).not.toMatch(/Reset required|Removed .*SQLite/)
        ws = await connect()
        const restored = await sendWsCommand<ReturnType<GameSession['getState']>>(ws, { type: 'getState' })
        expect(restored.interaction).toEqual(loaded.interaction)
        expect(restored.state.round).toBe(loaded.state.round)
        expect(restored.state.players.map(({ parentCards, resources, fields }) => ({ parentCards, resources, fields })))
          .toEqual(loaded.state.players.map(({ parentCards, resources, fields }) => ({ parentCards, resources, fields })))
        if (attempt === 0) await close(ws)
      }

      const completed = await sendWsCommand<ReturnType<GameSession['getState']>>(ws!, {
        type: 'commitSelection',
        playerIndex: 0,
        payload: { crops: [] },
      })
      expect(completed.interaction.stateId).toBe('idle')
      expect(completed.state.players[0]!.cardStates.PS07).toMatchObject({
        infobox: 'Completed',
        extraData: { fatherCompletedTier: 2 },
      })
      expect(completed.state.players[0]!.resources).toEqual(loaded.state.players[0]!.resources)
      expect(completed.state.events.filter((event) =>
        event.type === 'card.infoboxChanged' && event.cardId === 'PS07')).toHaveLength(1)
      await close(ws!)
    } finally {
      restart('--kill-only')
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/test-environment.ts', 'cleanup', root], { cwd: repository })
    }
  }, 180_000)
})

describe.skipIf(process.platform !== 'linux')('restart-local process cleanup', () => {
  it('leaves no detached process groups when frontend startup fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oa-restart-processes-'))
    tempDirs.push(root)
    const backendPort = await reservePort()
    const frontendPort = await reservePort()
    const bin = join(root, 'bin')
    const nodeBin = join(root, 'node_modules/.bin')
    mkdirSync(bin, { recursive: true })
    mkdirSync(nodeBin, { recursive: true })
    execFileSync('git', ['init', '-q'], { cwd: root })
    writeFileSync(join(root, 'restart-local.sh'), readFileSync(scriptPath))
    writeServicesStub(root)
    chmodSync(join(root, 'restart-local.sh'), 0o755)

    const marker = join(root, 'backend-listening')
    const listenerPidFile = join(root, 'backend-listener.pid')
    const oldGroupFile = join(root, 'old-group.pid')
    const newGroupFile = join(root, 'new-group.pid')
    const viteWsBaseFile = join(root, 'vite-ws-base')
    const server = join(root, 'server.cjs')

    writeFileSync(server, `
const fs = require('node:fs')
fs.writeFileSync(process.env.TEST_LISTENER_PID_FILE, String(process.pid))
fs.writeFileSync(process.env.TEST_LISTENER_MARKER, '')
if (process.env.TEST_STUBBORN === '1') process.on('SIGTERM', () => {
  fs.rmSync(process.env.TEST_LISTENER_MARKER, { force: true })
  const timer = setInterval(() => {
    if (process.ppid === 1) process.exit(0)
  }, 10)
  timer.unref()
})
setInterval(() => {}, 1000)
`)
    const oldServer = join(root, 'old-server')
    writeExecutable(oldServer, `#!/bin/bash
echo "$$" > "$TEST_OLD_GROUP_FILE"
TEST_STUBBORN=1 node "$TEST_SERVER" &
wait
`)
    writeExecutable(join(nodeBin, 'tsx'), `#!/bin/bash
case "$*" in *local-rooms.ts*) exit 0 ;; esac
echo "$$" > "$TEST_NEW_GROUP_FILE"
node "$TEST_SERVER" &
wait
`)
    writeExecutable(join(nodeBin, 'vite'), `#!/bin/bash
echo "$VITE_WS_BASE" > "$TEST_VITE_WS_BASE_FILE"
exit 1
`)
    writeExecutable(join(bin, 'pnpm'), '#!/bin/bash\nexit 0\n')
    writeExecutable(join(bin, 'ip'), '#!/bin/bash\necho "    inet 127.0.0.1/8 scope global eth0"\n')
    writeExecutable(join(bin, 'lsof'), `#!/bin/bash
case "$*" in
  *TCP:$TEST_BACKEND_PORT*)
    if [ -f "$TEST_LISTENER_MARKER" ]; then cat "$TEST_LISTENER_PID_FILE"; fi
    ;;
esac
`)

    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      PNPM_BIN: join(bin, 'pnpm'),
      BACKEND_PORT: String(backendPort),
      FRONTEND_PORT: String(frontendPort),
      REPLAY_VIEWER_BUILD_ID: 'test-viewer',
      GAME_BUILD_ID: 'test-game',
      TEST_LISTENER_MARKER: marker,
      TEST_LISTENER_PID_FILE: listenerPidFile,
      TEST_OLD_GROUP_FILE: oldGroupFile,
      TEST_NEW_GROUP_FILE: newGroupFile,
      TEST_BACKEND_PORT: String(backendPort),
      TEST_VITE_WS_BASE_FILE: viteWsBaseFile,
      TEST_SERVER: server,
    }
    spawn('setsid', [oldServer], {
      cwd: root,
      env,
      stdio: 'ignore',
    })
    await waitForFile(oldGroupFile)
    await waitForFile(marker)
    const oldGroup = Number(readFileSync(oldGroupFile, 'utf8'))
    processGroups.push(oldGroup)

    const command = spawn('bash', [join(root, 'restart-local.sh'), '--intranet'], {
      cwd: root,
      env,
      timeout: 15_000,
    })
    let stdout = ''
    let stderr = ''
    command.stdout.on('data', chunk => { stdout += String(chunk) })
    command.stderr.on('data', chunk => { stderr += String(chunk) })
    const status = await new Promise<number | null>(resolve => {
      command.on('close', resolve)
    })

    expect(status).not.toBe(0)
    expect(existsSync(newGroupFile), `${stdout}\n${stderr}`).toBe(true)
    expect(readFileSync(viteWsBaseFile, 'utf8').trim()).toBe(`ws://127.0.0.1:${backendPort}/ws`)
    const newGroup = Number(readFileSync(newGroupFile, 'utf8'))
    processGroups.push(newGroup)
    expect(processGroupExists(oldGroup)).toBe(false)
    expect(processGroupExists(newGroup)).toBe(false)
  }, 20_000)
})
