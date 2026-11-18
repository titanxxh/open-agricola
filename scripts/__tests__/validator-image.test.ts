import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isolatedImageBuildScript } from '../ci/container-image-build'
import type { Runner } from '../ci/owner-local-run'
import { validateContainerImageArchive } from '../release/container-images-archive'
import { buildValidatorImage, validatorReceipt, validatorReceiptPath, type DockerCommand, type ValidatorInputs } from '../release/validator-image'

const sha = 'a'.repeat(40), producer = 'b'.repeat(40)
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
const roots: string[] = []
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

/** A minimal uncompressed Docker archive of one image, like BuildKit's `type=docker` export. */
function archive(root: string, { architecture = 'arm64', revision = sha, channel = 'stable' } = {}) {
  const payload = join(root, 'payload'); mkdirSync(payload, { recursive: true })
  const layer = Buffer.alloc(1024), config = JSON.stringify({ os: 'linux', architecture,
    config: { Labels: { 'org.opencontainers.image.revision': revision, 'io.open-agricola.release-channel': channel } },
    rootfs: { type: 'layers', diff_ids: [`sha256:${sha256(layer)}`] } })
  writeFileSync(join(payload, 'config.json'), config); writeFileSync(join(payload, 'layer.tar'), layer)
  writeFileSync(join(payload, 'manifest.json'), JSON.stringify([{ Config: 'config.json', RepoTags: [`oa-container-image:${sha}`], Layers: ['layer.tar'] }]))
  const path = join(root, 'built.tar')
  execFileSync('tar', ['-cf', path, '-C', payload, 'manifest.json', 'config.json', 'layer.tar'])
  return { bytes: readFileSync(path), imageId: `sha256:${sha256(config)}`, labels: JSON.parse(config).config.Labels as Record<string, string> }
}

function fixture({ buildFailures = 0, architecture = 'arm64', loadedArchitecture = 'arm64', frontendBuild = sha, hardlink = false, maxImageBytes }: {
  buildFailures?: number; architecture?: string; loadedArchitecture?: string; frontendBuild?: string; hardlink?: boolean; maxImageBytes?: number } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'oa-validator-image-')); roots.push(root)
  const output = join(root, 'run'), workRoot = join(root, 'work'), stateRoot = join(root, 'state')
  mkdirSync(join(output, 'logs'), { recursive: true }); mkdirSync(join(workRoot, 'validator-image'), { recursive: true })
  const built = archive(root, { architecture })
  const calls: string[] = [], environments: Record<string, string>[] = []
  let failures = buildFailures
  const runner: Runner = {
    async candidate(execution, command, args, phase, environment) {
      calls.push(`candidate ${phase} ${command} ${args.join(' ')}`); environments.push(environment)
      writeFileSync(join(execution.privateDirectory, `${phase}.log`), `log ${phase}\n`, { flag: 'wx' })
      if (phase.startsWith('image-build') && !phase.startsWith('image-build-reset')) {
        if (failures-- > 0) return 1
        const tar = join(execution.work, 'image.tar')
        writeFileSync(tar, built.bytes)
        if (hardlink) linkSync(tar, join(execution.work, 'image-copy.tar'))
        writeFileSync(join(execution.work, 'image-metadata.json'), JSON.stringify({ 'containerimage.config.digest': built.imageId }))
      }
      return 0
    },
    isolation(args, log) { calls.push(`isolation ${args[0]}`); writeFileSync(log, `isolation ${args[0]}\n`, { flag: 'wx' }) },
    verifySources() { throw new Error('unused') },
    collectDiagnostics() { throw new Error('unused') },
  }
  const metadata = { format: 1, gameBuildId: frontendBuild, basePath: '/open-agricola/', releaseChannel: 'stable', deploymentTarget: 'stable-hosted' }
  let loaded = false
  const docker: DockerCommand = args => {
    calls.push(`docker ${args.slice(0, 2).join(' ')}`)
    if (args[0] === 'info') return '[]'
    if (args[0] === 'load') { loaded = true; return '' }
    if (args[0] === 'image' && args[1] === 'inspect') {
      if (!loaded) throw new Error('No such image')
      return JSON.stringify([{ Id: built.imageId, Os: 'linux', Architecture: loadedArchitecture, Config: { Labels: built.labels } }])
    }
    if (args[0] === 'create') return 'f'.repeat(64)
    if (args[0] === 'cp') { writeFileSync(args.at(-1)!, JSON.stringify(metadata)); return '' }
    if (args[0] === 'rm' || args[0] === 'run') return ''
    throw new Error(`unexpected docker ${args.join(' ')}`)
  }
  const inputs: ValidatorInputs = { sha, channel: 'stable', producerSha: producer, output, ownerUid: 1000, ownerHome: '/home/owner', publicAssets: '/owner/assets',
    node: '/opt/oa-owner-local/node/bin/node', stateRoot, workRoot, maxImageBytes, now: () => Date.parse('2026-11-18T12:00:00Z') }
  return { inputs, runner, docker, calls, environments, built, stateRoot, sleep: async () => {} }
}

describe('owner validator image', () => {
  it('builds the same producer script for linux/arm64 only, and GitHub keeps its exact linux/amd64 command', () => {
    expect(isolatedImageBuildScript(sha, 'stable')).toBe([
      'docker buildx create --name oa-image --driver docker-container --driver-opt image=moby/buildkit@sha256:97719ccb2ac86fb44fd36f330a6d302f63dddd5326f3ada24f9c05ccac0d9098,memory=4g,memory-swap=4g,cpu-quota=200000,cpu-period=100000 --use',
      'docker buildx inspect --bootstrap oa-image',
      `docker buildx build --builder oa-image --platform linux/amd64 --provenance=false --sbom=false --metadata-file image-metadata.json --output type=docker,dest=image.tar,compression=uncompressed,force-compression=true --tag oa-container-image:${sha} --build-arg GAME_BUILD_ID=${sha} --build-arg RELEASE_CHANNEL=stable - < context.tar`,
    ].join('\n'))
    // The arm64 build uses the arm64 manifest of the same pinned BuildKit release; nothing else changes.
    expect(isolatedImageBuildScript(sha, 'stable', 'linux/arm64')).toBe(isolatedImageBuildScript(sha, 'stable')
      .replace('--platform linux/amd64', '--platform linux/arm64')
      .replace('moby/buildkit@sha256:97719ccb2ac86fb44fd36f330a6d302f63dddd5326f3ada24f9c05ccac0d9098', 'moby/buildkit@sha256:92f93f25966c544549b88144406ce8cd9dcdf5df128250711031a4acd9149a8e'))
  })

  it('builds in isolation, verifies after teardown, loads the arm64 image and records a private receipt', async () => {
    vi.stubEnv('GH_TOKEN', 'owner-secret-token'); vi.stubEnv('GHCR_PUBLISH_TOKEN', 'publish-secret')
    const value = fixture()
    const receipt = await buildValidatorImage(value.inputs, value.runner, value.docker, value.sleep)
    expect(value.calls.filter(call => call.startsWith('isolation')).map(call => call.split(' ')[1])).toEqual(['start', 'stop', 'cleanup'])
    expect(value.calls.filter(call => call.startsWith('candidate')).map(call => call.split(' ')[1])).toEqual(['smoke-image', 'smoke', 'image-build'])
    expect(value.calls.find(call => call.startsWith('candidate image-build'))).toContain(`--platform linux/arm64`)
    expect(value.calls.find(call => call.startsWith('candidate image-build'))).toContain(`--build-arg GAME_BUILD_ID=${sha} --build-arg RELEASE_CHANNEL=stable`)
    // No owner or registry credential reaches a candidate command.
    expect(value.environments.every(environment => JSON.stringify(environment) === JSON.stringify({ TMPDIR: '/home/oa-candidate/tmp' }))).toBe(true)
    // Trusted verification and loading happen only after the identity is gone.
    expect(value.calls.indexOf('docker load --input')).toBeGreaterThan(value.calls.indexOf('isolation cleanup'))
    expect(value.calls).toContain('docker run --rm')
    expect(receipt).toMatchObject({ format: 1, kind: 'owner-validator-image', sourceSha: sha, producerSha: producer, channel: 'stable', platform: 'linux/arm64',
      imageId: value.built.imageId, configDigest: value.built.imageId, archiveManifestDigest: null, archiveSha256: sha256(value.built.bytes), archiveBytes: value.built.bytes.length,
      builderImage: 'moby/buildkit@sha256:92f93f25966c544549b88144406ce8cd9dcdf5df128250711031a4acd9149a8e',
      buildLogSha256: sha256('log image-build\n'), createdAt: '2026-11-18T12:00:00.000Z' })
    const path = validatorReceiptPath(sha, 'stable', value.stateRoot)
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(statSync(value.stateRoot).mode & 0o777).toBe(0o700)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(receipt)
  })

  it('gives a failed build one fresh builder and records every attempt', async () => {
    const value = fixture({ buildFailures: 1 })
    const receipt = await buildValidatorImage(value.inputs, value.runner, value.docker, value.sleep)
    expect(value.calls.filter(call => call.startsWith('candidate')).map(call => call.split(' ')[1])).toEqual(['smoke-image', 'smoke', 'image-build', 'image-build-reset-a1', 'image-build-a1'])
    expect(value.calls.find(call => call.startsWith('candidate image-build-reset-a1'))).toContain('docker buildx rm oa-image')
    expect(receipt.isolation.preparation.map(row => [row.phase, row.exitCode])).toEqual([['smoke-image', 0], ['smoke', 0], ['image-build', 1], ['image-build-reset-a1', 0], ['image-build-a1', 0]])
    expect(receipt.buildLogSha256).toBe(sha256('log image-build-a1\n'))
  })

  it.each([
    ['a build that keeps failing', { buildFailures: 2 }, /image-build failed/],
    ['a hardlinked archive', { hardlink: true }, /Untrusted validator image output: image.tar/],
    ['an oversized archive', { maxImageBytes: 100 }, /Untrusted validator image output: image.tar/],
    ['an amd64 archive', { architecture: 'amd64' }, /platform differs/],
    ['a loaded image of another architecture', { loadedArchitecture: 'amd64' }, /platform differs/],
    ['a hosted frontend of another build', { frontendBuild: 'c'.repeat(40) }, /Hosted frontend does not match/],
  ])('tears down and writes no receipt for %s', async (_, options, message) => {
    const value = fixture(options)
    await expect(buildValidatorImage(value.inputs, value.runner, value.docker, value.sleep)).rejects.toThrow(message)
    expect(value.calls.filter(call => call.startsWith('isolation')).map(call => call.split(' ')[1])).toEqual(['start', 'stop', 'cleanup'])
    expect(existsSync(validatorReceiptPath(sha, 'stable', value.stateRoot))).toBe(false)
  })

  it('accepts an arm64 archive only where the caller names arm64', () => {
    const root = mkdtempSync(join(tmpdir(), 'oa-validator-archive-')); roots.push(root)
    const built = archive(root), path = join(root, 'image.tar')
    writeFileSync(path, built.bytes); chmodSync(path, 0o600)
    const check = (architecture?: 'amd64' | 'arm64') => validateContainerImageArchive({ archivePath: path, imageId: built.imageId, sourceSha: sha, channel: 'stable', maxBytes: 1 << 20, allowProducerTag: true, architecture })
    expect(() => check()).toThrow(/platform differs/)
    expect(check('arm64').sha256).toBe(sha256(built.bytes))
  })

  it('returns a recorded image only while the owner Docker holds that exact arm64 image', async () => {
    const value = fixture()
    await buildValidatorImage(value.inputs, value.runner, value.docker, value.sleep)
    const lookup = (docker: DockerCommand) => validatorReceipt(sha, { stateRoot: value.stateRoot, docker })
    expect(lookup(value.docker)?.imageId).toBe(value.built.imageId)
    expect(validatorReceipt(sha, { channel: 'prerelease', stateRoot: value.stateRoot, docker: value.docker })).toBeNull()
    expect(lookup(() => { throw new Error('No such image') })).toBeNull()
    const inspected = (patch: Record<string, unknown>) => () => JSON.stringify([{ Id: value.built.imageId, Os: 'linux', Architecture: 'arm64', Config: { Labels: value.built.labels }, ...patch }])
    expect(() => lookup(inspected({ Architecture: 'amd64' }))).toThrow(/differs from its receipt/)
    expect(() => lookup(inspected({ Config: { Labels: { ...value.built.labels, 'org.opencontainers.image.revision': 'c'.repeat(40) } } }))).toThrow(/differs from its receipt/)
    chmodSync(validatorReceiptPath(sha, 'stable', value.stateRoot), 0o644)
    expect(() => lookup(value.docker)).toThrow(/owner-private regular file/)
  })
})
