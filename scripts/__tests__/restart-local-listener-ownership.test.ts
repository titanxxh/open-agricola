import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const script = readFileSync('restart-local.sh', 'utf8')
const helpers = script.slice(script.indexOf('list_listening_pids()'), script.indexOf('dev_rooms_without_variant()'))
const startup = script.slice(script.indexOf('STARTED_PROCESS_TARGETS=()'), script.indexOf('trap cleanup_failed_start EXIT'))
const roots: string[] = []
const groups: number[] = []

afterEach(() => {
  for (const group of groups.splice(0)) {
    try { process.kill(-group, 'SIGKILL') } catch { /* Already stopped. */ }
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('restart-local listener ownership without setsid', () => {
  it.each(['child', 'grandchild', 'unrelated'] as const)('checks a real %s listener in the launcher process group', async (mode) => {
    const root = mkdtempSync(join(tmpdir(), 'oa-listener-'))
    roots.push(root)
    const reservation = createServer().listen(0, '127.0.0.1')
    await once(reservation, 'listening')
    const address = reservation.address()
    if (!address || typeof address === 'string') throw new Error('Missing reserved port')
    reservation.close()
    await once(reservation, 'close')
    writeFileSync(join(root, 'listener.cjs'), `
      const server = require('node:net').createServer()
      server.listen(Number(process.env.TEST_PORT), '127.0.0.1')
    `)
    writeFileSync(join(root, 'wrapper.cjs'), `
      const { spawn } = require('node:child_process')
      const mode = process.argv[2]
      if (mode === 'idle') setInterval(() => {}, 1000)
      else spawn(process.execPath, mode === 'grandchild' ? ['wrapper.cjs', 'child'] : ['listener.cjs'], { stdio: 'inherit' })
    `)
    // Exercise the launcher's real helpers while forcing its macOS/no-setsid
    // branch on Linux too. A sibling shares the process group but is not owned.
    const shell = `
      set -euo pipefail
      ${helpers}
      ${startup}
      command() {
        if [ "$*" = '-v setsid' ]; then return 1; fi
        builtin command "$@"
      }
      if [ "$TEST_MODE" = unrelated ]; then
        "$TEST_NODE" listener.cjs > unrelated.log 2>&1 &
        wait_for_port_state "$TEST_PORT" yes 30 0.1
      fi
      mode="$TEST_MODE"
      if [ "$mode" = unrelated ]; then mode=idle; fi
      start_and_wait backend "$TEST_PORT" backend.log "$TEST_NODE" wrapper.cjs "$mode"
    `
    const child = spawn('bash', ['-c', shell], {
      cwd: root,
      env: { ...process.env, TEST_NODE: process.execPath, TEST_MODE: mode, TEST_PORT: String(address.port) },
      detached: true,
      timeout: 10000,
    })
    if (child.pid) groups.push(child.pid)
    let output = ''
    child.stdout.on('data', data => { output += String(data) })
    child.stderr.on('data', data => { output += String(data) })
    const status = await new Promise<number | null>((resolve, reject) => {
      child.on('error', reject)
      child.on('close', resolve)
    })
    expect(status, output).toBe(mode === 'unrelated' ? 1 : 0)
    if (mode === 'unrelated') expect(output).toContain('another process acquired backend port')
  })
})
