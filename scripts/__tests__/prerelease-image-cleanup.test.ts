import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { afterEach, expect, it } from 'vitest'
import { parsePrereleaseTarget, targetFingerprint } from '../prerelease/config'
import { readRuntime, writeRuntime, type RuntimeRecord } from '../prerelease/runtime'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
const sha = (value: string) => value.repeat(40).slice(0, 40)
const image = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`
const policySha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

function fixture() {
  const temporary = mkdtempSync(join(tmpdir(), 'agricola-pre-images-')); roots.push(temporary)
  const root = join(temporary, 'open-agricola-prerelease-test')
  mkdirSync(join(root, 'data'), { recursive: true }); mkdirSync(join(root, 'control'), { recursive: true, mode: 0o700 })
  const config = {
    format: 2, channel: 'prerelease', imageSource: 'owner-imported-ghcr', targetId: 'prerelease-test',
    directory: root, policyDirectory: resolve('.'), project: 'open-agricola-prerelease-test',
    origin: 'https://pre.agricola-beta.test', port: 18575, network: 'open-agricola-prerelease-test-dependencies',
    database: { host: '127.0.0.1', port: 5432, name: 'oa_prerelease_test', appRole: 'oa_prerelease_test_app', backupRole: 'oa_prerelease_test_backup' },
    validationDatabase: { host: '127.0.0.1', port: 5432, name: 'oa_prerelease_test_validation', role: 'oa_prerelease_test_validator' },
    objects: { endpoint: 'http://127.0.0.1:9000', bucket: 'oa-prerelease-test', prefix: 'live/', appKeyId: 'pre-app', backupKeyId: 'pre-backup' },
    offsite: { host: 'backup-fixture', directory: '/srv/backups/open-agricola-prerelease-test' },
    formal: { project: 'open-agricola', directory: '/srv/open-agricola', appOrigin: 'https://app.agricola.test', apiOrigin: 'https://api.agricola.test', database: 'agricola', bucket: 'agricola', offsiteDirectory: '/srv/backups/open-agricola' },
    budgets: { app: { memoryMiB: 512, cpus: 1, pids: 256 }, tools: { memoryMiB: 512, cpus: 1, pids: 128 }, sessions: { rooms: 10 }, import: { maxArchiveMiB: 256, memoryHeadroomMiB: 128, intake: { memoryMiB: 128, cpus: 1, pids: 64 } }, diskMiB: 4096, reserveMemoryMiB: 256 },
  }
  writeFileSync(join(root, '.env'), 'DATABASE_URL=postgres://oa_prerelease_test_app:fixture@127.0.0.1/oa_prerelease_test\nS3_BUCKET=oa-prerelease-test\nS3_PREFIX=live/\nS3_ACCESS_KEY_ID=pre-app\nS3_SECRET_ACCESS_KEY=fixture-app\nS3_ENDPOINT=http://127.0.0.1:9000\nS3_REGION=us-east-1\nS3_FORCE_PATH_STYLE=true\nPRERELEASE_IDENTITY_SERVICE_KEY=fixture-service-key-0123456789abcdef0123456789\n')
  writeFileSync(join(root, 'data/dependencies.compose.env'), 'DATABASE_URL=postgres://oa_prerelease_test_backup:fixture@127.0.0.1/oa_prerelease_test\nVALIDATION_DATABASE_URL=postgres://oa_prerelease_test_validator:fixture@127.0.0.1/oa_prerelease_test_validation\nS3_BUCKET=oa-prerelease-test\nS3_PREFIX=live/\nS3_ACCESS_KEY_ID=pre-backup\nS3_SECRET_ACCESS_KEY=fixture-backup\nS3_ENDPOINT=http://127.0.0.1:9000\nS3_REGION=us-east-1\nS3_FORCE_PATH_STYLE=true\n')
  chmodSync(join(root, '.env'), 0o600); chmodSync(join(root, 'data/dependencies.compose.env'), 0o600)
  const path = join(temporary, 'target.json'); writeFileSync(path, JSON.stringify(config))
  const target = parsePrereleaseTarget(config)
  // Stateful Docker: images.txt lists present native IDs; containers.txt maps container ID to image ID.
  const bin = join(temporary, 'bin'); mkdirSync(bin)
  writeFileSync(join(temporary, 'images.txt'), ''); writeFileSync(join(temporary, 'containers.txt'), '')
  writeFileSync(join(bin, 'docker'), `#!/bin/sh
printf '%s\\n' "$*" >> '${temporary}/calls'
I='${temporary}/images.txt'; C='${temporary}/containers.txt'
case "$1 $2" in
  'ps -a') cut -d' ' -f1 "$C";;
  'inspect --format') shift 3; for c in "$@"; do grep "^$c " "$C" | cut -d' ' -f2; done;;
  'image rm') if cut -d' ' -f2 "$C" | grep -qx "$3"; then echo "conflict: image is being used by a container" >&2; exit 1; fi
    grep -qx "$3" "$I" || { echo "No such image: $3" >&2; exit 1; }; grep -vx "$3" "$I" > "$I.next"; mv "$I.next" "$I";;
  'image inspect') [ ! -f '${temporary}/daemon-down' ] || { echo "Cannot connect to the Docker daemon" >&2; exit 1; }
    grep -qx "$5" "$I" || { echo "Error response from daemon: No such image: $5" >&2; exit 1; }; printf '%s\\n' "$5";;
  *) echo "unexpected docker $*" >&2; exit 64;;
esac
`, { mode: 0o700 })
  const env: NodeJS.ProcessEnv = { ...process.env, CI: '', GITHUB_ACTIONS: '', PATH: `${bin}:${process.env.PATH}` }
  const invoke = (action: string, current = sha('a')) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/prerelease/operations.ts', action, '--expected-current', current, '--config', path], { encoding: 'utf8', env, timeout: 15000 })
  const cache = (purpose: 'candidate' | 'trusted-policy', sourceSha: string, producerSha: string, nativeImageId: string, fingerprint = targetFingerprint(target)) => {
    writeFileSync(join(root, 'control', `image-${purpose}-${sourceSha}-${producerSha}.json`), JSON.stringify({ fingerprint, nativeImageId, archiveManifestDigest: null }))
    writeFileSync(join(temporary, 'images.txt'), readFileSync(join(temporary, 'images.txt'), 'utf8') + nativeImageId + '\n')
  }
  const record = (extra: Partial<RuntimeRecord> = {}) => writeRuntime(target, { ...readRuntime(target), mode: 'open', buildId: sha('a'), generation: '11111111-1111-4111-8111-111111111111',
    installed: { buildId: sha('a'), image: image('1'), installedAt: 1 }, operation: null, acceptance: null, ...extra })
  const images = () => readFileSync(join(temporary, 'images.txt'), 'utf8').split('\n').filter(Boolean)
  const calls = () => existsSync(join(temporary, 'calls')) ? readFileSync(join(temporary, 'calls'), 'utf8') : ''
  return { root, temporary, target, invoke, cache, record, images, calls,
    container: (id: string, imageId: string) => writeFileSync(join(temporary, 'containers.txt'), readFileSync(join(temporary, 'containers.txt'), 'utf8') + `${id} ${imageId}\n`) }
}

function seed(value: ReturnType<typeof fixture>) {
  value.record()
  value.cache('candidate', sha('a'), policySha, image('1'))           // installed candidate
  value.cache('trusted-policy', policySha, policySha, image('2'))      // current policy tooling
  value.cache('candidate', sha('b'), sha('e'), image('3'))             // previous candidate, older policy
  value.cache('trusted-policy', sha('e'), sha('e'), image('4'))        // older policy tooling
  value.cache('candidate', sha('c'), sha('e'), image('5'))             // old candidate still used by a stopped container
  value.container('c'.repeat(64), image('1')); value.container('d'.repeat(64), image('5'))
}
const parse = (result: ReturnType<typeof spawnSync>) => { expect(result.stderr).toBe(''); expect(result.status).toBe(0); return JSON.parse(String(result.stdout)) }
const short = (entries: Array<{ nativeImageId: string; reasons?: string[] }>) => entries.map(entry => [entry.nativeImageId.slice(7, 8), ...(entry.reasons ?? [])])

it('plans removal of only unreferenced imported prerelease images and changes nothing', () => {
  const value = fixture(); seed(value)
  const plan = parse(value.invoke('image-cleanup-plan'))
  expect(plan.mode).toBe('plan')
  expect(short(plan.keep)).toEqual([['1', 'installed-candidate', 'runtime-record', 'container'], ['5', 'container'], ['2', 'current-policy']])
  expect(short(plan.remove)).toEqual([['3'], ['4']])
  expect(value.images()).toHaveLength(5)
  expect(value.calls()).not.toContain('image rm')
  expect(readdirSync(join(value.root, 'control')).filter(name => name.startsWith('image-'))).toHaveLength(5)
})

it('removes unreferenced images, retires their cache records, and reruns harmlessly', () => {
  const value = fixture(); seed(value)
  const result = parse(value.invoke('image-cleanup'))
  expect(short(result.removed)).toEqual([['3'], ['4']])
  expect(result.retained).toEqual([])
  expect(value.images().sort()).toEqual([image('1'), image('2'), image('5')])
  expect(readdirSync(join(value.root, 'control', 'retired-images')).sort()).toEqual([`image-candidate-${sha('b')}-${sha('e')}.json`, `image-trusted-policy-${sha('e')}-${sha('e')}.json`])
  expect(value.calls()).not.toMatch(/image rm (-f|--force)/)
  expect(parse(value.invoke('image-cleanup-plan')).remove).toEqual([])
  expect(parse(value.invoke('image-cleanup')).removed).toEqual([])
})

it('keeps a cache record when Docker refuses to remove its image', () => {
  const value = fixture(); seed(value)
  value.container('e'.repeat(64), image('3'))
  // The plan sees the new container reference and keeps the image instead of trying to remove it.
  const result = parse(value.invoke('image-cleanup'))
  expect(short(result.removed)).toEqual([['4']])
  expect(short(result.keep)).toContainEqual(['3', 'container'])
  expect(value.images()).toContain(image('3'))
  expect(existsSync(join(value.root, 'control', `image-candidate-${sha('b')}-${sha('e')}.json`))).toBe(true)
})

it('keeps import records when Docker cannot confirm that their image is gone', () => {
  const value = fixture(); seed(value)
  writeFileSync(join(value.temporary, 'daemon-down'), '')
  const result = parse(value.invoke('image-cleanup'))
  expect(result.removed).toEqual([])
  expect(short(result.retained)).toEqual([['3'], ['4']])
  expect(result.retained.every((entry: { error: string }) => entry.error.includes('could not confirm'))).toBe(true)
  expect(value.images()).toHaveLength(5)
  expect(readdirSync(join(value.root, 'control')).filter(name => name.startsWith('image-'))).toHaveLength(5)
  expect(readdirSync(join(value.root, 'control', 'retired-images'))).toEqual([])
})

it('frees space beside a staged import archive, refuses a pending operation and ignores foreign records', () => {
  const value = fixture(); seed(value)
  value.cache('candidate', sha('f'), sha('e'), image('6'), 'f'.repeat(64))
  expect(parse(value.invoke('image-cleanup-plan')).foreign).toEqual([`image-candidate-${sha('f')}-${sha('e')}.json`])
  // A failed import keeps its uploaded archive; cleanup must still free the space that import needs.
  const staged = 'image-import-22222222-2222-4222-8222-222222222222.tar'
  writeFileSync(join(value.root, 'control', staged), 'archive')
  const freed = parse(value.invoke('image-cleanup'))
  expect(short(freed.removed)).toEqual([['3'], ['4']])
  expect(freed.stagedImports).toEqual([staged])
  expect(readFileSync(join(value.root, 'control', staged), 'utf8')).toBe('archive')
  value.record({ mode: 'maintenance', operation: { id: '33333333-3333-4333-8333-333333333333', kind: 'deploy', stage: 'acceptance', buildId: sha('b'), image: image('3'),
    sourceBuildId: sha('a'), sourceImage: image('1'), backupStem: null, generation: '11111111-1111-4111-8111-111111111111' } })
  const callsBefore = value.calls()
  const pending = value.invoke('image-cleanup')
  expect(pending.status).not.toBe(0)
  expect(pending.stderr).toContain('pending prerelease operation')
  expect(value.images().sort()).toEqual([image('1'), image('2'), image('5'), image('6')])
  expect(value.calls().slice(callsBefore.length)).not.toContain('image rm')
})
