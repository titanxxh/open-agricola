import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { backendImageMaintenanceFixture as fixture, nativeCompose, removeBackendImageMaintenanceRoots } from './_helpers/backend-image-maintenance-fixture'

// These integration cases launch multiple helper processes; low-core CI needs a file-local test budget.
vi.setConfig({ testTimeout: 15_000 })

afterEach(removeBackendImageMaintenanceRoots)

it('bootstraps explicitly proven empty storage with a preloaded immutable Caddy and no invented source backup', () => {
  const value = fixture('', true), result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  const commands = value.calls().map(call => call.args.join(' '))
  expect(commands.some(command => command.includes(' export ') || command.includes(' validate ') || command.startsWith('stop'))).toBe(false)
  expect(commands.findIndex(command => command.includes('check-empty'))).toBeLessThan(commands.findIndex(command => command.includes('check-live')))
  expect(commands.findIndex(command => command.includes('check-live'))).toBeLessThan(commands.findIndex(command => command.includes(' up ')))
  const config = value.compose()
  expect(config.services.capture).toBeUndefined()
  expect(config.services.caddy.image).toBe(value.caddyImage)
  const native = nativeCompose(value.directory)
  expect(native.status, native.stderr).toBe(0)
  expect(JSON.parse(native.stdout).services.app.image).toBe(value.imageId)
  expect(JSON.parse(native.stdout).services.caddy.image).toBe(value.caddyImage)
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toBe(value.originalEnv + `BACKEND_IMAGE=${value.imageId}\nCADDY_IMAGE=${value.caddyImage}\n`)
})

it.each(['nonempty', 'unsupported-empty', 'caddy-digest', 'caddy-architecture', 'existing-caddy', 'retained-volume', 'caddy-foreign'])('rejects bootstrap %s before initializing or starting a stack', failure => {
  const value = fixture(failure, true), result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls().some(call => call.args.includes('check-live') || call.args.includes('up'))).toBe(false)
  expect(existsSync(join(value.directory, 'data/deployed-image.json'))).toBe(false)
})

it.each(['deployed', 'ledger', 'backup', 'legacy', 'sqlite', 'local-ledger'])('rejects local %s history even without application containers', history => {
  const value = fixture('', true)
  const file = { deployed: 'data/deployed-build-id', ledger: 'backups/replay-removals.latest.json', backup: 'backups/pre-old.tgz', legacy: 'legacy-data/database.sqlite', sqlite: 'data/open-agricola.db', 'local-ledger': 'data/replay-removals.jsonl' }[history]
  if (!file) throw new Error('Missing fixture path')
  mkdirSync(resolve(value.directory, file, '..'), { recursive: true })
  writeFileSync(join(value.directory, file), 'retained')
  const result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls().some(call => call.args.includes('check-empty') || call.args.includes('check-live') || call.args.includes('up'))).toBe(false)
})

it.each(['up-identity', 'caddy-up-identity', 'up'])('keeps an unaccepted bootstrap closed and drains both newly started services after %s', failure => {
  const value = fixture(failure, true)
  expect(value.invoke().status).not.toBe(0)
  expect(value.current().started).toBe(false)
  expect(value.current().caddyStarted).toBe(false)
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toBe(value.originalEnv + 'BACKEND_IMAGE=\nCADDY_IMAGE=\n')
  expect(nativeCompose(value.directory).status).not.toBe(0)
})

it('does not infer bootstrap permission from a missing retained application', () => {
  const value = fixture('missing-app'), result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls().some(call => call.args.includes('check-empty') || call.args.includes('check-live') || call.args.includes('up'))).toBe(false)
})

it('refuses prior Caddy selector evidence in explicit bootstrap mode', () => {
  const value = fixture('', true)
  writeFileSync(join(value.directory, '.env'), value.originalEnv + `CADDY_IMAGE=${value.caddyImage}\n`)
  expect(value.invoke().status).not.toBe(0)
  expect(value.calls().some(call => call.args.includes('check-empty'))).toBe(false)
})

it('rejects ambiguous Caddy selectors before source mutation', () => {
  const value = fixture()
  writeFileSync(join(value.directory, '.env'), value.originalEnv + `CADDY_IMAGE=${value.caddyImage}\n`)
  expect(value.invoke().status).not.toBe(0)
  expect(value.calls().some(call => call.kind === 'git')).toBe(false)
})

it('still attempts Caddy stop when an unaccepted bootstrap application cannot be drained', () => {
  const value = fixture('up-app-stop', true), result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('application drain could not be confirmed')
  expect(value.current().started).toBe(true)
  expect(value.current().caddyStarted).toBe(false)
  expect(value.calls().filter(call => call.args[0] === 'stop').map(call => call.args.at(-1))).toEqual(['3'.repeat(64), '2'.repeat(64)])
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toBe(value.originalEnv + 'BACKEND_IMAGE=\nCADDY_IMAGE=\n')
})

it('prepares owner-owned public community storage before the first bootstrap tool even with private umask', () => {
  const value = fixture('', true), community = join(value.directory, 'data/community'), preload = join(value.root, 'private-umask.mjs')
  expect(existsSync(community)).toBe(false)
  writeFileSync(preload, 'process.umask(0o077)')
  const result = value.invoke(value.request.sourceSha, { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${preload}` })
  expect(result.status, result.stderr).toBe(0)
  const observations = readFileSync(join(value.root, 'community-before-run.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(observations[0]).toEqual({ exists: true, directory: true, uid: process.getuid?.(), mode: 0o755 })
  expect(statSync(community).uid).toBe(process.getuid?.())
  expect(statSync(community).mode & 0o777).toBe(0o755)
})

it('preserves existing owner community bytes and permissions during an upgrade', () => {
  const value = fixture(), community = join(value.directory, 'data/community')
  mkdirSync(community, { mode: 0o700 })
  writeFileSync(join(community, 'whats-new.json'), 'preserve owner publication')
  const result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  expect(statSync(community).mode & 0o777).toBe(0o700)
  expect(readFileSync(join(community, 'whats-new.json'), 'utf8')).toBe('preserve owner publication')
})

it.each(['file', 'symlink', 'unwritable'])('refuses unsafe %s community storage before stopping or migrating', kind => {
  const value = fixture(), community = join(value.directory, 'data/community')
  if (kind === 'file') writeFileSync(community, 'keep owner bytes')
  else if (kind === 'symlink') { mkdirSync(join(value.root, 'outside-community')); symlinkSync(join(value.root, 'outside-community'), community) }
  else { mkdirSync(community); chmodSync(community, 0o500) }
  const result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls().some(call => call.args[0] === 'stop' || call.args.includes('check-empty') || call.args.includes('check-live'))).toBe(false)
  if (kind === 'file') expect(readFileSync(community, 'utf8')).toBe('keep owner bytes')
  if (kind === 'unwritable') expect(statSync(community).mode & 0o777).toBe(0o500)
})

it('accepts the Docker Hub canonical spelling of the same preloaded Caddy digest', () => {
  const value = fixture('caddy-canonical', true), result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  expect(value.compose().services.caddy.image).toBe(value.caddyImage)
})

it('failed readonly empty proof creates no project volume and removes only its own transient container', () => {
  const value = fixture('nonempty', true), result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.current().projectVolume).toBe(false)
  expect(value.current().proofRemoved).toBe(true)
  const args: string[] = JSON.parse(readFileSync(join(value.root, 'empty-proof-create.json'), 'utf8'))
  expect(args).toEqual(expect.arrayContaining(['--read-only', '--network', 'shared_dependencies', '--memory', '384m', '--memory-swap', '384m', '--cpus', '1', '--pids-limit', '64']))
  expect(args.some(arg => ['--volume', '-v', '--mount', '--publish'].includes(arg))).toBe(false)
  expect(value.calls().some(call => call.args.includes('check-live') || call.args.includes('up'))).toBe(false)
  expect(value.calls().filter(call => call.args[0] === 'rm' && call.args.includes('4'.repeat(64))).map(call => call.args)).toEqual([['rm', '-f', '-v', '4'.repeat(64)]])
})
