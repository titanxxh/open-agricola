// @covers scripts/verify-parallel.mjs
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const runner = resolve(import.meta.dirname, '../verify-parallel.mjs')

/** A fake pnpm that records its pid and how it ended; it ignores nothing and exits on SIGTERM after cleanup. */
function fakePnpm(exitCode = 0) {
  const root = mkdtempSync(join(tmpdir(), 'oa-verify-parallel-')); roots.push(root)
  const script = join(root, 'pnpm')
  writeFileSync(script, `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path'), root = ${JSON.stringify(root)};
fs.writeFileSync(path.join(root, 'args.json'), JSON.stringify(process.argv.slice(2)));
fs.writeFileSync(path.join(root, 'pid'), String(process.pid));
process.on('SIGTERM', () => { fs.writeFileSync(path.join(root, 'stopped'), 'SIGTERM'); process.exit(143) });
if (${exitCode} !== 0 || process.env.FAKE_PNPM_QUICK === '1') process.exit(${exitCode});
setInterval(() => {}, 1000);
`)
  chmodSync(script, 0o755)
  return root
}
function start(root: string, env: Record<string, string> = {}) {
  const child = spawn(process.execPath, [runner, 'e2e-tests/a.spec.ts'], {
    env: { ...process.env, PATH: root + delimiter + process.env.PATH, VERIFY_PARALLEL_LANES: '', ...env }, stdio: 'ignore' })
  return { child, exit: new Promise<number | null>(done => child.once('close', code => done(code))) }
}
const until = async (check: () => boolean) => { for (let i = 0; i < 200 && !check(); i++) await new Promise(done => setTimeout(done, 25)) }

describe('verify:parallel with one lane', () => {
  it('runs pnpm verify in place and returns its status', async () => {
    const quick = fakePnpm(0)
    expect(await start(quick, { FAKE_PNPM_QUICK: '1' }).exit).toBe(0)
    expect(JSON.parse(readFileSync(join(quick, 'args.json'), 'utf8'))).toEqual(['verify', 'e2e-tests/a.spec.ts'])
    expect(await start(fakePnpm(3)).exit).toBe(3)
  })

  it('forwards cancellation to the in-place child, waits for it and reports the interruption', async () => {
    const root = fakePnpm()
    const run = start(root)
    await until(() => existsSync(join(root, 'pid')))
    run.child.kill('SIGTERM')
    expect(await run.exit).toBe(143)
    expect(readFileSync(join(root, 'stopped'), 'utf8')).toBe('SIGTERM')
  }, 20_000)
})
