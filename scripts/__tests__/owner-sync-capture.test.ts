// @covers scripts/owner-sync-capture.sh
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyStorageArchive } from '../storage-archive'

// The host side of the Owner-local Backup runs from the deployed checkout; the owner tools that pull, validate and
// prune the copies are tested in the owner repository.
const sourceBuild = 'a'.repeat(40), image = `sha256:${'b'.repeat(64)}`, container = 'c'.repeat(64)
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const temporary = (prefix: string) => { const root = mkdtempSync(join(tmpdir(), prefix)); roots.push(root); return root }
const captureLine = (output: string): unknown => {
  const line = output.split('\n').filter(text => text.startsWith('OWNER_CAPTURE ')).at(-1)
  return line === undefined ? undefined : JSON.parse(line.slice('OWNER_CAPTURE '.length))
}

describe('owner capture archive', () => {
  it('rejects a copied archive whose object entry is malformed instead of skipping it', async () => {
    const root = temporary('oa-owner-verify-')
    const dump = Buffer.from('dump bytes'), body = Buffer.from('viewer')
    writeFileSync(join(root, 'database.dump'), dump)
    mkdirSync(join(root, 'objects'))
    const sha = createHash('sha256').update(body).digest('hex')
    writeFileSync(join(root, 'objects', sha), body)
    const manifest = (objects: unknown[]) => writeFileSync(join(root, 'archive.json'), JSON.stringify({ version: 1, sourceBuildId: sourceBuild, createdAt: '2026-11-17T00:00:00Z', schema: 'public',
      database: { sha256: createHash('sha256').update(dump).digest('hex'), size: dump.length }, objects }))
    manifest([{ key: 'replay-viewers/x/index.html', sha256: sha, size: body.length, contentType: 'text/html' }])
    expect((await verifyStorageArchive(root)).objects).toHaveLength(1)
    for (const bad of [{ sha256: sha.slice(0, 10) }, { key: '../escape' }, { size: -1 }]) {
      manifest([{ key: 'replay-viewers/x/index.html', sha256: sha, size: body.length, contentType: 'text/html', ...bad }])
      await expect(verifyStorageArchive(root)).rejects.toThrow('Invalid object archive identity')
    }
    manifest([{ key: 'replay-viewers/x/index.html', sha256: sha, size: body.length + 1, contentType: 'text/html' }])
    await expect(verifyStorageArchive(root)).rejects.toThrow('Object archive integrity failure')
  })
})

// Real shell, timeout and flock; Docker is a fixture that records calls and writes capture files.
function host(args: string[], failure = '') {
  const root = temporary('oa-owner-capture-')
  for (const path of ['scripts', 'scripts/ci', 'bin', 'backups']) mkdirSync(join(root, path), { recursive: true })
  for (const path of ['scripts/owner-sync-capture.sh', 'scripts/backup-process.sh', 'scripts/ci/docker-bind-user.ts']) cpSync(path, join(root, path))
  writeFileSync(join(root, '.env'), 'S3_SECRET_ACCESS_KEY=never-copied\n')
  mkdirSync(join(root, 'backups/.capture-owner-earlier/capture'), { recursive: true })
  writeFileSync(join(root, 'bin/docker'), `#!/bin/bash
set -eu
printf '%s\\n' "$*" >> "$PWD/docker-calls"
case "$*" in
  *' ps -q app') printf '${container}' ;;
  *'{{.State.Running}}'*) printf true ;;
  *'{{.Image}}'*) printf '${image}' ;;
  'ps -q --no-trunc '*'oneoff=False') printf '${container}' ;;
  *'com.docker.compose.project'*) printf open-agricola ;;
  'ps -aq '*) ;;
  *'RESOURCE_DELETION_PROTOCOL'*) printf 1 ;;
  *'process.env.GAME_BUILD_ID'*) printf '${sourceBuild}' ;;
  *'ledger-export /backup/'*) for a in "$@"; do [[ "$a" == /backup/*ledger.json ]] && printf '{"version":1,"batches":[]}' > "$PWD/backups/\${a#/backup/}"; done ;;
  *'export-online /backup/'*)
    [[ "\${OWNER_TEST_FAILURE:-}" != export ]] || exit 42
    for a in "$@"; do if [[ "$a" == /backup/*/capture ]]; then mkdir -p "$PWD/backups/\${a#/backup/}/database"; printf '{}' > "$PWD/backups/\${a#/backup/}/archive.json"; fi; done ;;
  'rm -f '*) ;;
  *) echo "Unexpected fixture Docker command: $*" >&2; exit 88 ;;
esac
`, { mode: 0o700 })
  const result = spawnSync('/bin/bash', ['scripts/owner-sync-capture.sh', ...args], { cwd: root, encoding: 'utf8', timeout: 15_000,
    env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, BACKUP_JOB_ID: 'fixture-run', OWNER_TEST_FAILURE: failure, BACKUP_DEADLINE_EPOCH_MS: String(Date.now() + 60_000) } })
  if (result.error) throw result.error
  const calls = existsSync(join(root, 'docker-calls')) ? readFileSync(join(root, 'docker-calls'), 'utf8').trim().split('\n') : []
  return { ...result, root, calls, backups: readdirSync(join(root, 'backups')).sort() }
}

describe('host owner capture', () => {
  it('captures online from the running image in directory form, replacing an earlier owner copy and copying no configuration', () => {
    const result = host(['capture'])
    expect(result.status, result.stderr).toBe(0)
    expect(captureLine(result.stdout)).toEqual({ name: '.capture-owner-fixture-run', sourceBuildId: sourceBuild, image })
    expect(result.calls.find(call => call.includes('export-online'))).toContain('export-online /backup/.capture-owner-fixture-run/capture --directory-database')
    expect(result.calls.some(call => /\b(stop|start|restart)\b.* app$/.test(call))).toBe(false)
    expect(result.backups.filter(name => name.startsWith('.capture-owner-'))).toEqual(['.capture-owner-fixture-run'])
    expect(readdirSync(join(result.root, 'backups/.capture-owner-fixture-run')).sort()).toEqual(['capture', 'ledger.json'])
    expect(result.backups.some(name => name.startsWith('.pending-'))).toBe(false)
  })

  it('leaves no partial owner copy when the export fails', () => {
    const result = host(['capture'], 'export')
    expect(result.status).not.toBe(0)
    expect(result.stdout).not.toContain('OWNER_CAPTURE ')
    expect(result.backups.filter(name => name.startsWith('.capture-owner-') || name.startsWith('.pending-'))).toEqual([])
  })

  it('releases only an owner capture by name', () => {
    const released = host(['release', '.capture-owner-earlier'])
    expect(released.status, released.stderr).toBe(0)
    expect(released.backups).not.toContain('.capture-owner-earlier')
    const refused = host(['release', '../.env'])
    expect(refused.status).toBe(1)
    expect(existsSync(join(refused.root, '.env'))).toBe(true)
  })
})
