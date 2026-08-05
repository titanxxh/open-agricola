import { execFileSync, spawn } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = resolve(import.meta.dirname, '../../restart-intranet.sh')
const tempDirs: string[] = []
const processGroups: number[] = []

const writeExecutable = (path: string, contents: string): void => {
  writeFileSync(path, contents)
  chmodSync(path, 0o755)
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

describe.skipIf(process.platform !== 'linux')('restart-intranet process cleanup', () => {
  it('leaves no detached process groups when frontend startup fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oa-restart-processes-'))
    tempDirs.push(root)
    const bin = join(root, 'bin')
    const nodeBin = join(root, 'node_modules/.bin')
    mkdirSync(bin, { recursive: true })
    mkdirSync(nodeBin, { recursive: true })
    execFileSync('git', ['init', '-q'], { cwd: root })
    writeFileSync(join(root, 'restart-intranet.sh'), readFileSync(scriptPath))
    chmodSync(join(root, 'restart-intranet.sh'), 0o755)

    const marker = join(root, 'backend-listening')
    const listenerPidFile = join(root, 'backend-listener.pid')
    const oldGroupFile = join(root, 'old-group.pid')
    const newGroupFile = join(root, 'new-group.pid')
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
echo "$$" > "$TEST_NEW_GROUP_FILE"
node "$TEST_SERVER" &
wait
`)
    writeExecutable(join(nodeBin, 'vite'), '#!/bin/bash\nexit 1\n')
    writeExecutable(join(bin, 'pnpm'), '#!/bin/bash\nexit 0\n')
    writeExecutable(join(bin, 'ip'), '#!/bin/bash\necho "    inet 127.0.0.1/8 scope global eth0"\n')
    writeExecutable(join(bin, 'lsof'), `#!/bin/bash
case "$*" in
  *TCP:5175*)
    if [ -f "$TEST_LISTENER_MARKER" ]; then cat "$TEST_LISTENER_PID_FILE"; fi
    ;;
esac
`)

    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      PNPM_BIN: join(bin, 'pnpm'),
      REPLAY_VIEWER_BUILD_ID: 'test-viewer',
      GAME_BUILD_ID: 'test-game',
      TEST_LISTENER_MARKER: marker,
      TEST_LISTENER_PID_FILE: listenerPidFile,
      TEST_OLD_GROUP_FILE: oldGroupFile,
      TEST_NEW_GROUP_FILE: newGroupFile,
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

    const command = spawn('bash', [join(root, 'restart-intranet.sh')], {
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
    const newGroup = Number(readFileSync(newGroupFile, 'utf8'))
    processGroups.push(newGroup)
    expect(processGroupExists(oldGroup)).toBe(false)
    expect(processGroupExists(newGroup)).toBe(false)
  }, 20_000)
})
