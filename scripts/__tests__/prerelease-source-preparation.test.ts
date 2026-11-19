import { afterEach, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { exportRuntimeArchive } from '../prerelease/source-runtime-archive.ts'
import { approvedRuntimePin, installedRuntime, parseRuntimePin, runtimePinPath } from '../prerelease/source-runtime.ts'
import { parsePrereleaseTarget, targetFingerprint } from '../prerelease/config.ts'
import { preparePrereleaseSource, readPreparedPrereleaseSource, sourceReleaseDirectory } from '../prerelease/source-preparation.ts'
import { CONTAINER_IMAGE_REGISTRY } from '../release/container-images.ts'

const temps: string[] = []
const temp = () => {
  const directory = mkdtempSync(join(tmpdir(), 'oa-preparation-test-'))
  temps.push(directory)
  return directory
}
afterEach(() => {
  for (const directory of temps.splice(0)) rmSync(directory, { recursive: true, force: true })
})
const digest = (bytes: string) => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const pinRecord = {format: 1, recipeTree: '1'.repeat(40), image: CONTAINER_IMAGE_REGISTRY + '@' + digest('runtime'), configDigest: digest('config')}
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=fixture',
  '-c', 'user.email=fixture@local', ...args], {cwd, encoding: 'utf8'}).trim()

function policy() {
  const root = temp()
  mkdirSync(join(root, 'deploy'))
  git(root, 'init', '--quiet')
  mkdirSync(join(root, 'deploy/prerelease-runtime'))
  writeFileSync(join(root, 'deploy/prerelease-runtime/Dockerfile'), 'FROM scratch\n')
  git(root, 'add', 'deploy/prerelease-runtime')
  const pin = { ...pinRecord, recipeTree: git(root, 'rev-parse', git(root, 'write-tree') + ':deploy/prerelease-runtime') }
  writeFileSync(join(root, runtimePinPath), JSON.stringify(pin))
  git(root, 'add', runtimePinPath)
  git(root, 'commit', '--quiet', '-m', 'approved image')
  return {root, pin, buildId: git(root, 'rev-parse', 'HEAD')}
}

it('requires the candidate and owner policy to agree on the registry manifest and native config', () => {
  const {root, buildId, pin} = policy()
  expect(approvedRuntimePin(root, buildId)).toEqual(parseRuntimePin(pin))
  writeFileSync(join(root, runtimePinPath), JSON.stringify({...pin, configDigest: digest('other')}))
  git(root, 'commit', '-qam', 'rotated runtime')
  expect(() => approvedRuntimePin(root, buildId)).toThrow('trusted policy pin')
  expect(() => parseRuntimePin({...pinRecord, image: CONTAINER_IMAGE_REGISTRY + ':latest'})).toThrow('registry pin')
})

it('requires a freshly published pin after the runtime recipe changes on protected main', () => {
  const {root} = policy()
  writeFileSync(join(root, 'deploy/prerelease-runtime/Dockerfile'), 'FROM scratch\nENV RUNTIME_REVISION=2\n')
  git(root, 'commit', '-qam', 'update runtime recipe')
  expect(() => approvedRuntimePin(root, git(root, 'rev-parse', 'HEAD'))).toThrow('Runtime recipe changed')
})

it.each([false, true])('reuses a prepared artifact and approved locally loaded runtime (containerd %s)', containerd => {
  const {root, buildId} = policy()
  const config = JSON.parse(readFileSync('deploy/prerelease-target.example.json', 'utf8'))
  const target = parsePrereleaseTarget({...config, directory: join(temp(), config.project), policyDirectory: root})
  const app = sourceReleaseDirectory(target, buildId)
  const pin = parseRuntimePin(pinRecord)
  const image = containerd ? pin.manifestDigest : pin.configDigest
  mkdirSync(join(app, 'frontend-dist'), {recursive: true})
  const receipt = {format: 1, buildId, targetFingerprint: targetFingerprint(target), image, runtimeDigest: pin.manifestDigest}
  writeFileSync(join(dirname(app), 'receipt.json'), JSON.stringify(receipt), {mode:0o600})
  const meta = join(app, 'frontend-dist/frontend-build.json')
  writeFileSync(meta, JSON.stringify({format:1, basePath:'/open-agricola/', gameBuildId: buildId, releaseChannel:'prerelease', deploymentTarget:'prerelease-hosted'}), {mode:0o600})
  const bin = temp()
  const imageInfo = {Id:image, Architecture:'amd64', Os:'linux', Config:{Labels:{'io.open-agricola.prerelease-runtime':'1'}}}
  writeFileSync(join(bin, 'docker'), '#!/bin/sh\ncase "$1 $2" in\n' +
    '"info --format") echo \'' + JSON.stringify(containerd ? [['driver-type','io.containerd.snapshotter.v1']] : []) + '\';;\n' +
    '"image ls") echo ' + image + ';;\n"image inspect") echo \'' + JSON.stringify(imageInfo) + '\';;\n*) exit 11;; esac\n', {mode:0o700})
  const previous = process.env.PATH
  process.env.PATH = bin + ':' + previous
  try {
    expect(preparePrereleaseSource(target, buildId)).toEqual({buildId, image, runtimeDigest:pin.manifestDigest})
    writeFileSync(meta, '{}')
    expect(() => readPreparedPrereleaseSource(target, buildId)).toThrow('frontend')
  } finally { process.env.PATH = previous }
  expect(installedRuntime(pin, args => args[0] === 'info' ? '[]' : '')).toEqual({image:pin.configDigest, available:false})
})

function registryFixture() {
  const config = '{"os":"linux","architecture":"amd64"}'
  const layer = 'fixture layer contents'
  const descriptor = (raw: string) => ({digest:digest(raw), size:Buffer.byteLength(raw)})
  const manifest = JSON.stringify({schemaVersion:2, mediaType:'application/vnd.oci.image.manifest.v1+json',
    config:descriptor(config),layers:[descriptor(layer)]})
  const pin = parseRuntimePin({format:1, recipeTree: pinRecord.recipeTree, image:CONTAINER_IMAGE_REGISTRY + '@' + digest(manifest), configDigest:digest(config)})
  const fetcher = (corrupt: boolean): typeof fetch => async (url, options) => {
    const access = new Headers(options?.headers).get('authorization')
    if (String(url).startsWith('https://ghcr.io/token?')) {
      expect(access).toBe('Basic ' + Buffer.from('owner:token').toString('base64'))
      return Response.json({token:'pull'})
    }
    expect(access).toBe('Bearer pull')
    const body = String(url).includes('/manifests/') ? manifest : String(url).endsWith(digest(config)) ? config : corrupt ? layer.toUpperCase() : layer
    return new Response(body)
  }
  return {pin, fetcher, config, layer}
}

it('transfers a single pinned OCI image by manifest and config, including on a Docker store without RepoDigests', async () => {
  const {pin, fetcher, config, layer} = registryFixture()
  const archive = await exportRuntimeArchive(pin, {username:'owner',token:'token'}, temp(), 65536, fetcher(false))
  const unpack = (name: string) => execFileSync('tar',['-xOf', archive, name], {encoding:'utf8'})
  expect(JSON.parse(unpack('index.json')).manifests[0].digest).toBe(pin.manifestDigest)
  const [docker] = JSON.parse(unpack('manifest.json'))
  expect(unpack(docker.Config)).toBe(config)
  expect(unpack(docker.Layers[0])).toBe(layer)
  await expect(exportRuntimeArchive(pin, {username:'owner',token:'token'}, temp(), 65536, fetcher(true))).rejects.toThrow('differs from manifest')
  await expect(exportRuntimeArchive(pin, {username:'owner',token:'token'}, temp(), 32, fetcher(false))).rejects.toThrow('import limit')
})

it('admits the dedicated source budget only when the requested swap is present', async () => {
  const { checkPreparationSwap, parseSourceBudget } = await import('../prerelease/source-budget')
  const limits = { memoryMiB: 640, cpus: 1, pids: 128 }
  const budget = parseSourceBudget({ ...limits, swapMiB: 256 })
  expect(() => checkPreparationSwap(budget, () => 'SwapFree:    262144 kB\n')).not.toThrow()
  expect(() => checkPreparationSwap(budget, () => 'SwapFree:    262143 kB\n')).toThrow(/free swap/)
  expect(() => checkPreparationSwap(parseSourceBudget(limits), () => { throw Error('unneeded') })).not.toThrow()
  expect(() => parseSourceBudget({ ...limits, swapMiB: -1 })).toThrow(/swap budget/)
})
