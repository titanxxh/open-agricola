import { afterEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { imageBuildRequest, inspectPublishableImage, verifyPublishEnvironment } from '../ci/container-image-build'
import { checkPrivateRegistry, inspectRegistryManifest, publishedRegistryManifest } from '../ci/container-image-build-registry'

afterEach(() => vi.unstubAllGlobals())

const producerSha = 'a'.repeat(40)
const sourceSha = 'b'.repeat(40)
const environment = {
  GITHUB_ACTIONS: 'true', RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REPOSITORY: 'titanxxh/open-agricola', GITHUB_REPOSITORY_ID: '1164782262',
  GITHUB_REF: 'refs/heads/main', GITHUB_SHA: producerSha, GITHUB_WORKFLOW_SHA: producerSha,
  GITHUB_WORKFLOW_REF: 'titanxxh/open-agricola/.github/workflows/container-image-build.yml@refs/heads/main',
  GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2',
}

describe('trusted container image production admission', () => {
  it('rejects a fork before any image work is admitted', () => {
    expect(() => imageBuildRequest({ purpose: 'candidate', sourceSha }, { ...environment, GITHUB_REPOSITORY: 'fork/open-agricola' }))
      .toThrow(/trusted main/)
  })

  it.each([
    { GITHUB_REF: 'refs/heads/prerelease' }, { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_WORKFLOW_SHA: sourceSha }, { RUNNER_ARCH: 'ARM64' },
    { GITHUB_WORKFLOW_REF: 'titanxxh/open-agricola/.github/workflows/other.yml@refs/heads/main' },
  ])('refuses a different execution authority: %j', change => {
    expect(() => imageBuildRequest({ purpose: 'candidate', sourceSha }, { ...environment, ...change })).toThrow(/trusted main/)
  })

  it('does not let a candidate select stable policy tool authority', () => {
    expect(() => imageBuildRequest({ purpose: 'trusted-policy', sourceSha }, environment)).toThrow(/policy source/)
    expect(imageBuildRequest({ purpose: 'trusted-policy', sourceSha: producerSha }, environment)).toMatchObject({
      purpose: 'trusted-policy', channel: 'stable', producerSha, sourceSha: producerSha,
    })
    expect(imageBuildRequest({ purpose: 'candidate', sourceSha }, environment)).toMatchObject({
      purpose: 'candidate', channel: 'prerelease', sourceSha, producerSha, build: { runId: 123, runAttempt: 2 },
    })
  })
  it('requires a main-only publishing environment without adding a reviewer gate', () => {
    const env = { name: 'prerelease-image-publish', deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } }
    expect(() => verifyPublishEnvironment(env, { branch_policies: [{ name: 'main', type: 'branch' }] })).not.toThrow()
    expect(() => verifyPublishEnvironment(env, { branch_policies: [{ name: '*', type: 'branch' }] })).toThrow(/exact main/)
    expect(() => verifyPublishEnvironment(env, { branch_policies: [{ name: 'main', type: 'tag' }] })).toThrow(/exact main/)
  })
})

describe('private registry admission', () => {
  const credentials = { publishToken: 'private-publisher', probeToken: 'repository-reader', publisher: 'titanxxh', expectedPackageId: '17' }
  const imageId = `sha256:${'c'.repeat(64)}`
  it('refuses an already public package before publication', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/user')
      ? { login: 'titanxxh', type: 'User' } : { id: 17, name: 'open-agricola-images', package_type: 'container', visibility: 'public', repository: null }), { status: 200 })))
    await expect(checkPrivateRegistry(credentials)).rejects.toThrow(/private/)
  })
  it('rejects source annotations even when the config digest matches', () => {
    expect(() => inspectRegistryManifest({ schemaVersion: 2, config: { digest: imageId },
      annotations: { 'org.opencontainers.image.source': 'https://github.com/titanxxh/open-agricola' } }, imageId)).toThrow(/repository linkage/)
  })
  it.each(['linked', 'unknown-id', 'reader-access', 'anonymous-access'])('blocks unsafe existing package state: %s', failure => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/user')) return Response.json({ login: 'titanxxh', type: 'User' })
      if (url.includes('/versions')) return Response.json([{ name: `sha256:${'d'.repeat(64)}` }])
      if (url.includes('ghcr.io/token')) {
        const auth = new Headers(options?.headers).get('Authorization')
        return auth ? Response.json({ token: 'reader' }) : failure === 'anonymous-access' ? Response.json({ token: 'anonymous' }) : new Response('', { status: 403 })
      }
      if (url.includes('/manifests/')) return failure === 'reader-access' || failure === 'anonymous-access'
        ? Response.json({ schemaVersion: 2, config: { digest: imageId } }) : new Response('', { status: 401 })
      return Response.json({ id: failure === 'unknown-id' ? 18 : 17, name: 'open-agricola-images', package_type: 'container',
        visibility: 'private', repository: failure === 'linked' ? { full_name: 'titanxxh/open-agricola' } : null })
    }))
    return expect(checkPrivateRegistry(credentials)).rejects.toThrow()
  })
  it('allows first publication only for the authenticated namespace owner when no package exists', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/user')
      ? Response.json({ login: 'titanxxh', type: 'User' }) : new Response('', { status: 404 })))
    await expect(checkPrivateRegistry({ ...credentials, expectedPackageId: '' })).resolves.toBeNull()
    await expect(checkPrivateRegistry(credentials)).rejects.toThrow(/setup/)
    await expect(checkPrivateRegistry({ ...credentials, expectedPackageId: '' }, true)).rejects.toThrow(/setup/)
  })
  it('accepts a known independent private package only after real access denials', async () => {
    const reads: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/user')) return Response.json({ login: 'titanxxh', type: 'User' })
      if (url.includes('/versions')) return Response.json([{ name: `sha256:${'d'.repeat(64)}` }])
      if (url.includes('ghcr.io/token')) {
        reads.push(new Headers(options?.headers).get('Authorization') ?? 'anonymous')
        return new Response('', { status: 403 })
      }
      return Response.json({ id: 17, name: 'open-agricola-images', package_type: 'container', visibility: 'private', repository: null })
    }))
    await expect(checkPrivateRegistry(credentials)).resolves.toBe(17)
    expect(reads).toHaveLength(2)
    expect(reads[0]).toBe('anonymous')
    expect(Buffer.from(reads[1].slice('Basic '.length), 'base64').toString()).toContain(':repository-reader')
  })
  it('does not misreport a registry outage as proof of denied access', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/user')) return Response.json({ login: 'titanxxh', type: 'User' })
      if (url.includes('/versions')) return Response.json([{ name: `sha256:${'d'.repeat(64)}` }])
      if (url.includes('ghcr.io/token')) return new Response('', { status: 503 })
      return Response.json({ id: 17, name: 'open-agricola-images', package_type: 'container', visibility: 'private', repository: null })
    }))
    await expect(checkPrivateRegistry(credentials)).rejects.toThrow(/probe failed/)
  })
  it('binds the published registry digest to the returned bytes and verified image ID', async () => {
    const body = JSON.stringify({ schemaVersion: 2, config: { digest: imageId } })
    const digest = `sha256:${createHash('sha256').update(body).digest('hex')}`
    let reported = digest
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/token?')
      ? Response.json({ token: 'publisher-scoped' }) : new Response(body, { headers: { 'docker-content-digest': reported } })))
    await expect(publishedRegistryManifest('candidate-fixed', imageId, credentials)).resolves.toBe(digest)
    await expect(publishedRegistryManifest('candidate-fixed', `sha256:${'e'.repeat(64)}`, credentials)).rejects.toThrow(/verified single-platform/)
    reported = `sha256:${'f'.repeat(64)}`
    await expect(publishedRegistryManifest('candidate-fixed', imageId, credentials)).rejects.toThrow(/content digest/)
  })
})

it('keeps registry credentials out of the candidate steps and uploads only the explicit receipt', () => {
  const workflow = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/container-image-build.yml'), 'utf8')
  const publish = workflow.indexOf('- name: Publish private image')
  expect(publish).toBeGreaterThan(workflow.indexOf('- name: Verify stopped build output'))
  expect(workflow.slice(0, publish)).not.toContain('secrets.')
  expect(workflow).toContain('packages: read')
  expect(workflow).not.toContain('packages: write')
  expect(workflow).toContain("if: github.ref == 'refs/heads/main'")
  expect(workflow).toContain('path: ${{ runner.temp }}/container-image/receipt/container-image-receipt.json')
  expect(workflow).not.toMatch(/upload-artifact[\s\S]*path:[^\n]*(?:image\.tar|\*|candidate-isolation)/)
})

it('the actual Node CLI refuses a broad publishing environment before isolation or build', () => {
  const bin = mkdtempSync(join(tmpdir(), 'oa-image-cli-'))
  try {
    writeFileSync(join(bin, 'git'), `#!${process.execPath}\nif(process.argv[2]==='rev-parse')console.log('${producerSha}')\n`)
    writeFileSync(join(bin, 'gh'), `#!${process.execPath}\nconsole.log(JSON.stringify(process.argv[3].includes('deployment-branch-policies')?{branch_policies:[{name:'*',type:'branch'}]}:{name:'prerelease-image-publish',deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}}))\n`)
    chmodSync(join(bin, 'git'), 0o700); chmodSync(join(bin, 'gh'), 0o700)
    const result = spawnSync(process.execPath, [resolve(import.meta.dirname, '../ci/container-image-build.ts'), 'prepare', 'trusted-policy', producerSha, bin], {
      encoding: 'utf8', env: { ...environment, PATH: bin + delimiter + process.env.PATH }, timeout: 10_000,
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Configure prerelease-image-publish with the exact main branch')
  } finally { rmSync(bin, { recursive: true, force: true }) }
})

it('the actual Node CLI refuses output verification while the candidate account still exists', () => {
  const bin = mkdtempSync(join(tmpdir(), 'oa-image-alive-'))
  try {
    writeFileSync(join(bin, 'getent'), `#!${process.execPath}\nprocess.exit(0)\n`)
    chmodSync(join(bin, 'getent'), 0o700)
    const result = spawnSync(process.execPath, [resolve(import.meta.dirname, '../ci/container-image-build.ts'), 'verify'], {
      encoding: 'utf8', env: { PATH: bin + delimiter + process.env.PATH }, timeout: 10_000,
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Candidate account has not been removed; publishing is forbidden')
  } finally { rmSync(bin, { recursive: true, force: true }) }
})

describe('image publication boundary', () => {
  const request = imageBuildRequest({ purpose: 'candidate', sourceSha }, environment)
  const image = { Id: `sha256:${'c'.repeat(64)}`, Os: 'linux', Architecture: 'amd64', Config: { Labels: {
    'org.opencontainers.image.revision': sourceSha, 'io.open-agricola.release-channel': 'prerelease',
  } } }
  it('rejects candidate-supplied repository linkage before publishing a private package', () => {
    expect(() => inspectPublishableImage({ ...image, Config: { Labels: {
      ...image.Config.Labels, 'org.opencontainers.image.source': 'https://github.com/titanxxh/open-agricola',
    } } }, request)).toThrow(/repository linkage/)
  })
  it.each([{ Architecture: 'arm64' }, { Os: 'windows' }, { Id: 'mutable:latest' },
    { Config: { Labels: { ...image.Config.Labels, 'org.opencontainers.image.revision': producerSha } } },
    { Config: { Labels: { ...image.Config.Labels, 'io.open-agricola.release-channel': 'stable' } } },
  ])('refuses an image whose native identity differs: %j', change => {
    expect(() => inspectPublishableImage({ ...image, ...change }, request)).toThrow()
  })
  it('accepts only the intended immutable AMD64 candidate image', () => {
    expect(inspectPublishableImage(image, request)).toBe(image.Id)
  })
})
