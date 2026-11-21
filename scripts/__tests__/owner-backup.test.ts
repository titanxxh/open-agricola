// @covers scripts/owner-sync-capture.sh
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { abandonedValidations, expiredSnapshots, ownerValidator, parseCaptureLine, pruneSnapshots, rsyncArguments, snapshotName, snapshotTime, validateSnapshot } from '../owner-backup'
import { verifyStorageArchive } from '../storage-archive'

const sourceBuild = 'a'.repeat(40), image = `sha256:${'b'.repeat(64)}`, container = 'c'.repeat(64)
const recorded = vi.hoisted(() => ({ receipt: null as { imageId: string } | null, builds: [] as string[] }))
vi.mock('../release/validator-image.ts', () => ({
  validatorReceipt: (sha: string, options: { channel: string }) => { expect(options.channel).toBe('stable'); return recorded.receipt && { ...recorded.receipt, sourceSha: sha } },
  ensureValidatorImage: async (sha: string, options: { channel: string }) => { expect(options.channel).toBe('stable'); recorded.builds.push(sha); return { imageId: `sha256:${'e'.repeat(64)}` } },
}))
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const temporary = (prefix: string) => { const root = mkdtempSync(join(tmpdir(), prefix)); roots.push(root); return root }

describe('owner backup naming and retention', () => {
  it('reads the last capture line and refuses anything that is not a host capture report', () => {
    const report = `OWNER_CAPTURE {"name":".capture-owner-run-1","sourceBuildId":"${sourceBuild}","image":"${image}"}`
    expect(parseCaptureLine(`compose noise\n${report.replace('run-1', 'run-0')}\n${report}\n`)).toEqual({ name: '.capture-owner-run-1', sourceBuildId: sourceBuild, image })
    expect(() => parseCaptureLine('nothing here')).toThrow('did not report')
    expect(() => parseCaptureLine(report.replace('.capture-owner-run-1', '../etc'))).toThrow('Invalid owner capture report')
    expect(() => parseCaptureLine(report.replace(image, 'latest'))).toThrow('Invalid owner capture report')
  })

  it('names snapshots by capture time and removes every copy older than 30 days, including the newest', () => {
    const name = snapshotName('2026-11-17T04:30:12.345Z')
    expect(name).toBe('20261117T043012Z')
    expect(snapshotTime(name)).toBe(Date.parse('2026-11-17T04:30:12Z'))
    const now = Date.parse('2026-12-17T05:00:00Z')
    expect(expiredSnapshots(['20261117T043012Z', '20261118T043000Z', 'prototype-20261116', '.incoming-1'], now)).toEqual(['20261117T043012Z'])
    expect(expiredSnapshots(['20261101T000000Z'], now)).toEqual(['20261101T000000Z'])
  })

  it('prunes expired snapshots and abandoned incoming copies but leaves other names alone', () => {
    const root = temporary('oa-owner-prune-')
    for (const name of ['20261001T000000Z', '20261216T000000Z', 'prototype-20261116', `.incoming-${Date.parse('2026-12-01T00:00:00Z')}`, `.incoming-${Date.parse('2026-12-17T04:00:00Z')}`]) mkdirSync(join(root, name))
    expect(pruneSnapshots(root, Date.parse('2026-12-17T05:00:00Z'))).toEqual(['20261001T000000Z'])
    expect(readdirSync(root).sort()).toEqual([`.incoming-${Date.parse('2026-12-17T04:00:00Z')}`, '20261216T000000Z', 'prototype-20261116'])
  })

  it('pulls with private modes, compression and the previous copy as the rsync basis', () => {
    const args = rsyncArguments({ host: 'ubuntu@host', source: '/srv/backups/.capture-owner-1/capture/', destination: '/home/o/oa-backup/.incoming-1/capture/', linkDest: '/home/o/oa-backup/20261117T043012Z/capture', zstd: true })
    expect(args).toEqual(expect.arrayContaining(['-a', '--chmod=Du=rwx,Dgo=,Fu=rw,Fgo=', '--compress', '--compress-choice=zstd', '--link-dest=/home/o/oa-backup/20261117T043012Z/capture']))
    expect(args.slice(-2)).toEqual(['ubuntu@host:/srv/backups/.capture-owner-1/capture/', '/home/o/oa-backup/.incoming-1/capture/'])
    expect(rsyncArguments({ host: 'ubuntu@host', source: 's', destination: 'd', linkDest: null, zstd: false }).some(arg => arg.startsWith('--link-dest') || arg.startsWith('--compress-choice'))).toBe(false)
  })
})

describe('owner backup safety', () => {
  it('reaps validation services whose tool process is gone or whose deadline passed, and keeps a live run', () => {
    const now = 1_000_000, alive = (pid: number) => pid === 42
    expect(abandonedValidations([
      { id: 'live', owner: 42, deadline: now + 1 }, { id: 'dead-owner', owner: 7, deadline: now + 1 },
      { id: 'expired', owner: 42, deadline: now }, { id: 'unlabelled', owner: NaN, deadline: NaN },
    ], now, alive)).toEqual(['dead-owner', 'expired', 'unlabelled'])
  })

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
    expect(parseCaptureLine(result.stdout)).toEqual({ name: '.capture-owner-fixture-run', sourceBuildId: sourceBuild, image })
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

describe('owner snapshot validation', () => {
  const validatorImage = `sha256:${'d'.repeat(64)}`
  const snapshot = () => {
    const root = temporary('oa-owner-snapshot-'), path = join(root, '20261117T203111Z')
    mkdirSync(path, { recursive: true })
    writeFileSync(join(path, 'source.json'), JSON.stringify({ name: '.capture-owner-x', sourceBuildId: sourceBuild, image, host: 'ubuntu@host',
      capturedAt: '2026-11-17T20:31:11.306Z', pulledAt: '2026-11-17T20:35:32.169Z', archiveVersion: 2 }))
    return path
  }

  it('validates with the arm64 validator of the source build and keeps the host image only as the recorded binding', async () => {
    const path = snapshot(), selected: string[] = [], validated: string[] = []
    const report = await validateSnapshot(path, {
      validator: async build => { selected.push(build); return validatorImage },
      validate: input => { validated.push(input.image); expect(input.buildId).toBe(sourceBuild); return { formatVersion: 2, roomCount: 3 } },
    })
    // ADR 0047: the host's native linux/amd64 image ID is never looked up on the aarch64 owner machine.
    expect(selected).toEqual([sourceBuild])
    expect(validated).toEqual([validatorImage])
    expect(report).toMatchObject({ formatVersion: 2, roomCount: 3, validator: 'owner-local', image, validatorImage, validatorPlatform: 'linux/arm64' })
    expect(JSON.parse(readFileSync(join(path, 'validation.json'), 'utf8'))).toEqual(report)
  })

  it('reuses the recorded validator of the source build and builds one in isolation only when it is missing', async () => {
    recorded.receipt = { imageId: `sha256:${'d'.repeat(64)}` }; recorded.builds.splice(0)
    expect(await ownerValidator(sourceBuild)).toBe(`sha256:${'d'.repeat(64)}`)
    expect(recorded.builds).toEqual([])
    recorded.receipt = null
    expect(await ownerValidator(sourceBuild)).toBe(`sha256:${'e'.repeat(64)}`)
    expect(recorded.builds).toEqual([sourceBuild])
  })

  it('records nothing and names the source build when no validator image can be obtained', async () => {
    const path = snapshot(), validated: string[] = []
    await expect(validateSnapshot(path, {
      validator: async () => { throw new Error('Another owner-local verification holds the lock') },
      validate: input => { validated.push(input.image); return {} },
    })).rejects.toThrow(`needs the arm64 validator image of ${sourceBuild}: Another owner-local verification holds the lock`)
    expect(validated).toEqual([])
    expect(existsSync(join(path, 'validation.json'))).toBe(false)
  })
})
