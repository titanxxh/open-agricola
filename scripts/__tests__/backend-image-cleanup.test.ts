import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { executeBackendImageCleanup, planBackendImageCleanup } from '../release/backend-image-cleanup'
import { readBackendImageRequest } from '../release/backend-image-receiver'
import { createBackendImageFixture } from './_helpers/backend-image-fixture'

const roots: string[] = [], now = Date.now(), day = 86_400_000
const imageId = (number: number): string => `sha256:${number.toString(16).padStart(64, '0')}`
const buildId = (number: number): string => number.toString(16).padStart(40, '0')
function image(number: number, age = 40) {
  const tags: string[] = [], digests: string[] = []
  return { id: imageId(number), tags, digests, created: new Date(now - age * day).toISOString(), size: 1234, revision: buildId(number), build: `GAME_BUILD_ID=${buildId(number)}`, channel: 'stable', project: 'open-agricola', service: 'app' }
}
type Image = ReturnType<typeof image>
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'oa-image-gc-')); roots.push(directory)
  mkdirSync(join(directory, 'data')); mkdirSync(join(directory, 'backups'))
  writeFileSync(join(directory, '.env'), `PRIVATE_SENTINEL=do-not-print\nBACKEND_IMAGE=${imageId(1)}\n`, { mode: 0o600 })
  writeFileSync(join(directory, 'data/deployed-build-id'), buildId(1))
  writeFileSync(join(directory, 'data/deployed-image.json'), JSON.stringify({ sourceSha: buildId(1), nativeImageId: imageId(1) }))
  const legacy = { ...image(2), revision: '', build: '', channel: '', project: 'open-agricola', service: 'app', tags: ['open-agricola-app:latest', 'open-agricola:pre-v0.8.0'], digests: [`open-agricola-app@${imageId(2)}`, `open-agricola@${imageId(2)}`] }
  let images: Image[] = [{ ...image(1, 0), tags: ['open-agricola:backend'] }, legacy, { ...image(3), channel: '', project: 'open-agricola-operations', service: 'accounts-exporter' }]
  const containers = [{ id: '1'.repeat(64), image: imageId(1), project: 'open-agricola', service: 'app', build: `GAME_BUILD_ID=${buildId(1)}`, running: true }]
  const calls: string[][] = []
  let beforeCall: ((args: string[]) => void) | undefined
  const docker = (args: string[]): string => {
    calls.push(args); beforeCall?.(args)
    if (args[0] === 'image' && args[1] === 'ls') return images.map(image => image.id).join('\n')
    if (args[0] === 'image' && args[1] === 'inspect') return images.filter(image => args.includes(image.id)).map(image => JSON.stringify(image)).join('\n')
    if (args[0] === 'ps') return containers.map(container => container.id).join('\n')
    if (args[0] === 'container' && args[1] === 'inspect') return containers.map(container => JSON.stringify(container)).join('\n')
    if (args[0] === 'image' && args[1] === 'rm') {
      const reference = args.at(-1), selected = images.find(image => image.id === reference || image.tags.includes(reference ?? '') || image.digests.includes(reference ?? ''))
      if (!selected || containers.some(container => container.image === selected.id)) throw new Error('Docker refuses referenced image')
      if (selected.id === reference) {
        if (selected.tags.length > 1 || new Set([...selected.tags, ...selected.digests].map(value => value.split(/[:@]/)[0])).size > 1) throw new Error('Docker refuses multiple repositories')
        images = images.filter(image => image.id !== selected.id)
      } else {
        const repository = reference?.split(/[:@]/)[0]
        selected.tags = selected.tags.filter(tag => tag !== reference)
        if (reference?.includes('@')) selected.tags = selected.tags.filter(tag => tag.split(':')[0] !== repository)
        if (!selected.tags.some(tag => tag.split(':')[0] === repository)) selected.digests = selected.digests.filter(digest => digest.split('@')[0] !== repository)
      }
      return ''
    }
    throw new Error('Unexpected Docker command')
  }
  const plan = () => planBackendImageCleanup({ directory, docker, now })
  const execute = () => executeBackendImageCleanup({ directory, docker, expectedBuild: buildId(1), now })
  const backup = (source: number, target: number) => {
    const stem = `pre-${source}`
    writeFileSync(join(directory, 'backups', `${stem}.tgz`), 'archive')
    writeFileSync(join(directory, 'backups', `env-${stem}`), 'private-configuration')
    writeFileSync(join(directory, 'backups', `${stem}.manifest.json`), JSON.stringify({ formatVersion: 2, backupStem: stem, sourceBuildId: buildId(source), targetBuildId: buildId(target), validatedAt: new Date(now).toISOString() }))
  }
  const stage = (target: number, source: number, age: number) => {
    const operationId = `00000000-0000-0000-0000-${target.toString().padStart(12, '0')}`
    const path = join(directory, 'backups', `.backend-image-${operationId}`)
    mkdirSync(path)
    const request = { format: 1, operationId, directory, stage: path, sourceSha: buildId(target), producerSha: buildId(1), expiresAt: now - day, transfer: { receipt: { purpose: 'formal-candidate', channel: 'stable', repository: 'titanxxh/open-agricola', sourceSha: buildId(target), producerSha: buildId(1), imageId: imageId(target) } } }
    const boundRequest = Object.fromEntries(Object.entries(request).filter(([key]) => key !== 'expiresAt'))
    const bindingSha256 = createHash('sha256').update(JSON.stringify(boundRequest)).digest('hex')
    writeFileSync(join(path, 'image.json'), JSON.stringify({ format: 1, bindingSha256, sourceSha: buildId(target), producerSha: buildId(1), nativeImageId: imageId(target), imageId: imageId(target) }))
    writeFileSync(join(path, 'request.json'), JSON.stringify(request))
    writeFileSync(join(path, 'source.json'), JSON.stringify({ build: buildId(source), image: imageId(source) }))
    utimesSync(join(path, 'image.json'), new Date(now - age * day), new Date(now - age * day))
  }
  return { directory, calls, containers, docker, plan, execute, backup, stage, add: (value: Image) => images.push(value), images: () => images, setBeforeCall: (value: typeof beforeCall) => { beforeCall = value } }
}

it('plans the proven old multireference legacy app, keeps current and operations, and writes nothing', () => {
  const value = fixture(), before = readdirSync(join(value.directory, 'backups'))
  const plan = value.plan()
  expect(plan.images.filter(image => image.action === 'remove').map(image => image.id)).toEqual([imageId(2)])
  expect(plan.images.find(image => image.id === imageId(1))?.reasons).toContain('current-application')
  expect(plan.images.find(image => image.id === imageId(3))?.reasons).toContain('unknown-or-other-project')
  expect(readdirSync(join(value.directory, 'backups'))).toEqual(before)
  expect(value.calls.some(call => call.includes('rm'))).toBe(false)
  expect(JSON.stringify(plan)).not.toContain('do-not-print')
})

it('removes only verified historical refs and the full native ID, keeps private logs, and reruns harmlessly', () => {
  const value = fixture(), result = value.execute()
  expect(result.results).toEqual([{ image: imageId(2), status: 'removed' }])
  expect(value.calls.filter(call => call.includes('rm'))).toEqual([
    ['image', 'rm', '--no-prune', 'open-agricola-app:latest'],
    ['image', 'rm', '--no-prune', imageId(2)],
  ])
  expect(lstatSync(result.logDirectory).mode & 0o777).toBe(0o700)
  expect(lstatSync(join(result.logDirectory, 'result.json')).mode & 0o777).toBe(0o600)
  expect(readFileSync(join(result.logDirectory, 'result.json'), 'utf8')).not.toContain('do-not-print')
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toContain(`BACKEND_IMAGE=${imageId(1)}`)
  expect(value.execute().results).toEqual([])
})

it('protects stopped containers, retained source/target backup builds and current selectors', () => {
  const value = fixture()
  value.add(image(4)); value.add(image(5)); value.add(image(6))
  value.backup(4, 5)
  value.containers.push({ id: '9'.repeat(64), image: imageId(6), build: '', project: 'unrelated', service: 'tool', running: false })
  expect(value.plan().images.filter(image => image.action === 'remove').map(image => image.id)).toEqual([imageId(2)])
  writeFileSync(join(value.directory, '.env'), `BACKEND_IMAGE=${imageId(2)}\n`)
  expect(value.execute).toThrow('selector differs')
  expect(value.calls.some(call => call.includes('rm'))).toBe(false)
})

it('keeps five recent historical versions plus current, but expires old audit/source bindings', () => {
  const value = fixture()
  for (let id = 10; id <= 16; id++) value.add(image(id, id - 9))
  value.add(image(20)); value.add(image(21)); value.add(image(22)); value.add(image(23))
  value.stage(20, 21, 29); value.stage(22, 23, 31)
  const plan = value.plan()
  expect(plan.images.filter(image => image.action === 'remove').map(image => image.id)).toEqual([imageId(2), imageId(15), imageId(16), imageId(22), imageId(23)])
  expect(plan.images.find(image => image.id === imageId(20))?.reasons.some(reason => reason.startsWith('recent-import:'))).toBe(true)
  expect(plan.images.find(image => image.id === imageId(21))?.reasons.some(reason => reason.startsWith('recent-source:'))).toBe(true)
})

it('bounds audit protection to five stages and explicit recovery to thirty days', () => {
  const value = fixture()
  for (let id = 10; id <= 15; id++) { value.add(image(id)); value.stage(id, 1, id - 9) }
  expect(value.plan().images.find(image => image.id === imageId(15))?.action).toBe('remove')
  const pending = join(value.directory, 'backups/.backend-image-00000000-0000-0000-0000-000000000015/maintenance-admission.json')
  writeFileSync(pending, JSON.stringify({ phase: 'queued', queueUntil: now + 30 * 60_000 }))
  expect(value.plan().images.find(image => image.id === imageId(15))?.action).toBe('keep')
  rmSync(pending)
  const recovery = { format: 1, createdAt: new Date(now - day).toISOString(), expiresAt: new Date(now + day).toISOString(), images: [imageId(2)], builds: [buildId(15)] }
  writeFileSync(join(value.directory, 'data/backend-image-recovery.json'), JSON.stringify(recovery))
  expect(value.plan().images.filter(image => image.action === 'remove')).toEqual([])
  writeFileSync(join(value.directory, 'data/backend-image-recovery.json'), JSON.stringify({ ...recovery, expiresAt: new Date(now + 31 * day).toISOString() }))
  expect(value.plan).toThrow('bounded image recovery')
})

it('keeps unknown refs, prerelease images, malformed builds, and future dates', () => {
  const value = fixture()
  value.add({ ...image(4), tags: ['another-project:old'] })
  value.add({ ...image(5), channel: 'prerelease', project: 'open-agricola', service: 'app' })
  value.add({ ...image(6), build: 'GAME_BUILD_ID=unknown' })
  value.add({ ...image(7), created: new Date(now + day).toISOString() })
  value.add({ ...image(8), digests: [`ghcr.io/unknown/repository@${imageId(8)}`] })
  expect(value.plan().images.filter(image => image.action === 'remove').map(image => image.id)).toEqual([imageId(2)])
})

it('uses historical formal receipts for ownership without retaining expired audit images or trusted-policy caches', () => {
  const value = fixture()
  value.add({ ...image(4), project: '', service: '' })
  value.add({ ...image(5), project: '', service: '' })
  value.stage(4, 1, 31)
  const plan = value.plan()
  expect(plan.images.find(image => image.id === imageId(4))?.action).toBe('remove')
  expect(plan.images.find(image => image.id === imageId(5))?.reasons).toContain('unknown-or-other-project')
  const requestPath = join(value.directory, 'backups/.backend-image-00000000-0000-0000-0000-000000000004/request.json')
  const request = JSON.parse(readFileSync(requestPath, 'utf8')); request.transfer.receipt.purpose = 'trusted-policy'
  writeFileSync(requestPath, JSON.stringify(request))
  expect(value.plan).toThrow('does not prove application ownership')
})

it('rejects incomplete audit identities and a spliced request instead of classifying an unknown stable image', () => {
  const value = fixture(); value.add({ ...image(4), project: '', service: '' }); value.stage(4, 1, 31)
  const path = join(value.directory, 'backups/.backend-image-00000000-0000-0000-0000-000000000004')
  const requestPath = join(path, 'request.json'), reportPath = join(path, 'image.json')
  const request = JSON.parse(readFileSync(requestPath, 'utf8')), report = JSON.parse(readFileSync(reportPath, 'utf8'))
  for (const key of ['sourceSha', 'producerSha', 'imageId']) {
    const changedRequest = structuredClone(request), changedReport = structuredClone(report)
    delete changedRequest[key]; delete changedRequest.transfer.receipt[key]; delete changedReport[key]
    writeFileSync(requestPath, JSON.stringify(changedRequest)); writeFileSync(reportPath, JSON.stringify(changedReport))
    expect(value.plan).toThrow('Invalid image cleanup string')
  }
  writeFileSync(reportPath, JSON.stringify(report))
  writeFileSync(requestPath, JSON.stringify({ ...request, anotherUnsealedField: true }))
  expect(value.plan).toThrow('does not prove application ownership')
  expect(value.calls.some(call => call.includes('rm'))).toBe(false)
})

it('consumes an actual receiver-sealed canonical owner request, including renewed authorization', () => {
  const value = fixture(), imported = createBackendImageFixture(); roots.push(imported.root)
  const canonical = readBackendImageRequest(imported.requestPath)
  writeFileSync(imported.requestPath, JSON.stringify(canonical), { mode: 0o600 })
  const received = imported.invoke()
  expect(received.status, received.stderr).toBe(0)
  canonical.expiresAt = now - day
  writeFileSync(imported.requestPath, JSON.stringify(canonical), { mode: 0o600 })
  utimesSync(join(imported.stage, 'image.json'), new Date(now - 31 * day), new Date(now - 31 * day))
  mkdirSync(join(imported.directory, 'data'))
  for (const name of ['.env', 'data/deployed-build-id', 'data/deployed-image.json']) writeFileSync(join(imported.directory, name), readFileSync(join(value.directory, name)))
  value.add({ ...image(4), id: imported.imageId, revision: imported.request.sourceSha, build: `GAME_BUILD_ID=${imported.request.sourceSha}`, project: '', service: '' })
  const plan = planBackendImageCleanup({ directory: imported.directory, docker: value.docker, now })
  expect(plan.images.find(image => image.id === imported.imageId)?.action).toBe('remove')
})

it('replans execution and refuses newly referenced or retagged candidates without stopping containers', () => {
  const value = fixture()
  value.plan()
  value.containers.push({ id: '8'.repeat(64), image: imageId(2), build: '', project: 'another', service: 'tool', running: false })
  expect(value.execute().results).toEqual([])
  value.containers.pop()
  let imageReads = 0
  value.setBeforeCall(args => {
    if (args[0] === 'image' && args[1] === 'inspect' && ++imageReads === 3) value.images().find(image => image.id === imageId(2))?.tags.push('unknown:concurrent')
  })
  const result = value.execute()
  expect(result.results).toEqual([{ image: imageId(2), status: 'failed', reason: 'Image reference changed before untagging' }])
  expect(value.calls.some(call => call[0] === 'stop' || call.includes('--force'))).toBe(false)
  expect(value.images().some(image => image.id === imageId(2))).toBe(true)
})

it('retains diagnostics when Docker refuses a newly occupied native image', () => {
  const value = fixture()
  value.setBeforeCall(args => {
    if (args.at(-1) === imageId(2) && args[1] === 'rm') value.containers.push({ id: '7'.repeat(64), image: imageId(2), build: '', project: 'another', service: 'tool', running: false })
  })
  const result = value.execute()
  expect(result.failed).toBe(true)
  expect(result.results[0]?.reason).toContain('Docker refuses')
  expect(existsSync(join(result.logDirectory, 'result.json'))).toBe(true)
  expect(value.images().some(image => image.id === imageId(2))).toBe(true)
})

it('handles digest-only historical repositories without removing the keeper digest first', () => {
  const value = fixture(), legacy = value.images().find(image => image.id === imageId(2))
  if (!legacy) throw new Error('Missing fixture legacy image')
  legacy.tags = []
  const result = value.execute()
  expect(result.results).toEqual([{ image: imageId(2), status: 'removed' }])
  expect(value.calls.filter(call => call.includes('rm'))).toEqual([
    ['image', 'rm', '--no-prune', `open-agricola-app@${imageId(2)}`],
    ['image', 'rm', '--no-prune', imageId(2)],
  ])
})

it('does not report deletion when Docker returns success but retains the native image', () => {
  const value = fixture()
  const docker = (args: string[]): string => args[1] === 'rm' && args.at(-1) === imageId(2) ? '' : value.docker(args)
  const result = executeBackendImageCleanup({ directory: value.directory, expectedBuild: buildId(1), docker, now })
  expect(result.results).toEqual([{ image: imageId(2), status: 'failed', reason: 'Native image remains after Docker removal' }])
  expect(result.failed).toBe(true)
})

it('rejects alias metadata, malformed retained manifests, unaccepted legacy execution, and stale acceptance', () => {
  const value = fixture()
  expect(() => executeBackendImageCleanup({ directory: value.directory, docker: value.docker, expectedBuild: buildId(99) })).toThrow('expected accepted build')
  value.backup(4, 5)
  writeFileSync(join(value.directory, 'backups/pre-4.manifest.json'), '{}')
  expect(value.plan).toThrow('Retained backup')
  rmSync(join(value.directory, 'backups/pre-4.tgz'))
  rmSync(join(value.directory, 'data/deployed-image.json'))
  expect(value.execute).toThrow('receipt is required')
  writeFileSync(join(value.directory, 'data/deployed-image.json'), '{}')
  rmSync(join(value.directory, '.env'))
  writeFileSync(join(value.directory, 'another-env'), `BACKEND_IMAGE=${imageId(1)}\n`)
  symlinkSync(join(value.directory, 'another-env'), join(value.directory, '.env'))
  expect(value.plan).toThrow('without aliases')
})

it('runs streamed owner commands under the real maintenance lock without exposing environment values', () => {
  const value = fixture(), bin = join(value.directory, 'bin'); mkdirSync(bin)
  writeFileSync(join(value.directory, 'backups/.maintenance.lock'), '')
  const imagesPath = join(value.directory, 'mock-images.json'), containersPath = join(value.directory, 'mock-containers.json')
  writeFileSync(imagesPath, JSON.stringify(value.images())); writeFileSync(containersPath, JSON.stringify(value.containers))
  writeFileSync(join(bin, 'ssh'), '#!/bin/sh\nexec sh -c "$2"\n', { mode: 0o700 })
  writeFileSync(join(bin, 'docker'), `#!${process.execPath}\nconst fs=require('node:fs'),a=process.argv.slice(2),images=JSON.parse(fs.readFileSync(${JSON.stringify(imagesPath)})),containers=JSON.parse(fs.readFileSync(${JSON.stringify(containersPath)}));if(a[0]==='context')console.log(JSON.stringify(process.env.FIXTURE_DOCKER_SOCKET||'unix:///var/run/docker.sock'));else if(a[0]==='image'&&a[1]==='ls')console.log(images.map(x=>x.id).join('\\n'));else if(a[0]==='image'&&a[1]==='inspect')console.log(images.map(x=>JSON.stringify(x)).join('\\n'));else if(a[0]==='ps')console.log(containers.map(x=>x.id).join('\\n'));else if(a[0]==='container')console.log(containers.map(x=>JSON.stringify(x)).join('\\n'));else process.exit(98);`, { mode: 0o700 })
  chmodSync(join(value.directory, 'backups/.maintenance.lock'), 0o600)
  const script = resolve(import.meta.dirname, '../../cleanup-backend-images.sh')
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('DOCKER_'))), CI: '', PATH: `${bin}:${process.env.PATH}` }
  const result = spawnSync(script, ['ubuntu@fixture', value.directory], { encoding: 'utf8', env, timeout: 10_000 })
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout).images.filter((image: { action: string }) => image.action === 'remove').map((image: { id: string }) => image.id)).toEqual([imageId(2)])
  expect(result.stdout + result.stderr).not.toContain('do-not-print')
  const remoteDaemon = spawnSync(script, ['ubuntu@fixture', value.directory], { encoding: 'utf8', env: { ...env, FIXTURE_DOCKER_SOCKET: 'tcp://elsewhere:2375' }, timeout: 10_000 })
  expect(remoteDaemon.status).toBe(1)
  expect(remoteDaemon.stderr).toContain('local Unix Docker daemon')
  const unguarded = spawnSync(process.execPath, [resolve(import.meta.dirname, '../release/backend-image-cleanup.ts'), value.directory, '--execute'], { encoding: 'utf8', env: { ...process.env, BACKEND_IMAGE_GC_LOCKED: '' } })
  expect(unguarded.status).toBe(1)
  expect(unguarded.stderr).toContain('maintenance lock')
})
