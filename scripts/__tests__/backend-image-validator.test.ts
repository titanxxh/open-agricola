import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ADR 0047: a cutover with Owner-local Validation obtains the arm64 validator image before export and backend contact.
const order: string[] = []
vi.mock('../release/backend-candidate.ts', () => ({ backendCandidate: (_cwd: string, refs: string[]) => refs[0] }))
vi.mock('../release/container-images.ts', () => ({
  verifyContainerImageBuild: () => ({ producerSha: 'b'.repeat(40), imageId: `sha256:${'c'.repeat(64)}` }),
  assertExpectedContainerImage: () => undefined,
}))
vi.mock('../release/container-images-owner.ts', () => ({
  prepareContainerImageArchive: async () => { order.push('export'); throw new Error('stop after export') },
}))
const validator = vi.hoisted(() => ({ outcome: 'ok' as 'ok' | 'fail' }))
vi.mock('../release/owner-validator.ts', async original => ({
  ...await original<typeof import('../release/owner-validator')>(),
  ownerValidatorImage: async (sha: string) => {
    order.push(`validator ${sha}`)
    if (validator.outcome === 'fail') throw new Error('Owner-local Validation needs the arm64 validator image … rerun with --full-maintenance to validate on the host')
    return `sha256:${'d'.repeat(64)}`
  },
}))

const roots: string[] = []
afterEach(() => { vi.unstubAllEnvs(); order.splice(0); validator.outcome = 'ok'; for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function deployment() {
  const root = mkdtempSync(join(tmpdir(), 'oa-backend-validator-')); roots.push(root)
  const bin = join(root, 'bin'), ssh = join(root, 'ssh.calls'); mkdirSync(bin)
  writeFileSync(join(bin, 'git'), `#!${process.execPath}\nif(process.argv.includes('rev-parse'))console.log(${JSON.stringify('b'.repeat(40))});\n`, { mode: 0o700 })
  for (const name of ['ssh', 'scp']) writeFileSync(join(bin, name), `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(ssh)},'${name}\\n');process.exit(1)\n`, { mode: 0o700 })
  const budget = join(root, 'budget.json')
  writeFileSync(budget, JSON.stringify({ format: 1, import: { maxArchiveMiB: 2048, memoryHeadroomMiB: 512, intake: { memoryMiB: 384, cpus: 1, pids: 64 } }, diskMiB: 8192, reserveMemoryMiB: 512 }), { mode: 0o600 })
  vi.stubEnv('PATH', `${bin}:${process.env.PATH}`)
  const args = (...extra: string[]) => ['owner@example.test', 'a'.repeat(40), '/srv/formal', '--build-run', '1', '--build-attempt', '1', '--artifact-id', '2',
    '--auth-file', join(root, 'auth.json'), '--import-budget', budget, ...extra]
  return { root, args, backendCalls: () => existsSync(ssh) ? readFileSync(ssh, 'utf8').trim().split('\n') : [] }
}

describe('cutover validator image', () => {
  it('is obtained for the fixed source before the image export and any backend contact', async () => {
    const { backendImageDeployment } = await import('../release/backend-image')
    const value = deployment()
    await expect(backendImageDeployment(value.root, value.args())).rejects.toThrow('stop after export')
    expect(order).toEqual([`validator ${'a'.repeat(40)}`, 'export'])
    expect(value.backendCalls()).toEqual([])
  })

  it('stops the release before export and maintenance when it cannot be obtained, naming the host-validated path', async () => {
    const { backendImageDeployment } = await import('../release/backend-image')
    const value = deployment()
    validator.outcome = 'fail'
    await expect(backendImageDeployment(value.root, value.args())).rejects.toThrow('--full-maintenance')
    expect(order).toEqual([`validator ${'a'.repeat(40)}`])
    expect(value.backendCalls()).toEqual([])
  })

  it('is not requested when the owner chose host validation', async () => {
    const { backendImageDeployment } = await import('../release/backend-image')
    const value = deployment()
    await expect(backendImageDeployment(value.root, value.args('--full-maintenance'))).rejects.toThrow('stop after export')
    expect(order).toEqual(['export'])
  })
})

describe('owner validator image receipt', () => {
  const sha = 'a'.repeat(40), image = `sha256:${'d'.repeat(64)}`
  const receipt = (changes: Record<string, unknown> = {}) => JSON.stringify({ format: 1, kind: 'owner-validator-image', sourceSha: sha, channel: 'stable', platform: 'linux/arm64', imageId: image, ...changes })
  it('returns the image of a stable arm64 receipt for the fixed source', async () => {
    const original = await vi.importActual<typeof import('../release/owner-validator')>('../release/owner-validator')
    expect(await original.ownerValidatorImage(sha, async () => `building…\n${receipt()}\n`)).toBe(image)
  })

  it.each([
    ['a failed build', async (): Promise<string> => { throw new Error('validator-image.ts build exited 1') }],
    ['no receipt', async (): Promise<string> => 'nothing'],
    ['another source', async () => receipt({ sourceSha: 'e'.repeat(40) })],
    ['another platform', async () => receipt({ platform: 'linux/amd64' })],
    ['another channel', async () => receipt({ channel: 'prerelease' })],
    ['a malformed image ID', async () => receipt({ imageId: 'latest' })],
  ] as const)('rejects %s and names --full-maintenance', async (_name, build) => {
    const original = await vi.importActual<typeof import('../release/owner-validator')>('../release/owner-validator')
    await expect(original.ownerValidatorImage(sha, build)).rejects.toThrow(/Nothing was sent to the backend.*--full-maintenance/)
  })
})
