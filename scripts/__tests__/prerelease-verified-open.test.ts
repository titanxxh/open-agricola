import { chmodSync, linkSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FULL_TASK_IDS } from '../ci/verification-tasks'
import { RELEASE_REPOSITORY } from '../ci/release-github'
import { VERIFIED_OPEN_MAX_AGE_MS, admitReceipt, readVerifiedOpenReceipt, verifyOpen } from '../prerelease/operations'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const root = () => { const path = mkdtempSync(join(tmpdir(), 'oa-verified-open-')); chmodSync(path, 0o700); roots.push(path); return path }
const sha = 'c'.repeat(40)
const binding = { buildId: sha, policySha: 'd'.repeat(40), fingerprint: 'e'.repeat(64) }
const receipt = (overrides = {}) => ({ status: 'passed', channel: 'prerelease', repository: RELEASE_REPOSITORY, sha, configuration: 'a'.repeat(64), producerConfiguration: 'b'.repeat(64),
  tasks: FULL_TASK_IDS.map((id, index) => ({ id, status: 'passed', runId: 7, jobId: index + 1 })), ...overrides })

describe('verify-open', () => {
  it('writes an owner-private receipt once, bound to the candidate, policy and target', () => {
    const output = join(root(), 'verified-open.json'), checked: string[] = []
    expect(verifyOpen(binding, output, value => { checked.push(value); return receipt() }, 1_000)).toEqual({ output, verifiedAt: 1_000 })
    expect(checked).toEqual([sha])
    expect(statSync(output).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({ format: 1, action: 'open', ...binding, verifiedAt: 1_000, receipt: receipt() })
    expect(() => verifyOpen(binding, output, () => receipt(), 2_000)).toThrow(/EEXIST/)
  })

  it('writes nothing when GitHub verification does not yield a complete receipt', () => {
    const output = join(root(), 'verified-open.json')
    expect(() => verifyOpen(binding, output, () => receipt({ status: 'failed' }))).toThrow(/complete same-channel/)
    expect(() => statSync(output)).toThrow(/ENOENT/)
  })
})

describe('open --verified-receipt', () => {
  const written = (now = 10_000) => { const output = join(root(), 'verified-open.json'); verifyOpen(binding, output, () => receipt(), now); return output }

  it('returns the verified receipt within ten minutes of verification', () => {
    expect(readVerifiedOpenReceipt(written(), binding, 10_000 + VERIFIED_OPEN_MAX_AGE_MS)).toEqual(receipt())
  })

  it('rejects a stale, future or differently bound verification', () => {
    const path = written()
    expect(() => readVerifiedOpenReceipt(path, binding, 10_000 + VERIFIED_OPEN_MAX_AGE_MS + 1)).toThrow(/stale or bound/)
    expect(() => readVerifiedOpenReceipt(path, binding, 9_999)).toThrow(/stale or bound/)
    expect(() => readVerifiedOpenReceipt(path, { ...binding, buildId: 'f'.repeat(40) }, 10_000)).toThrow(/stale or bound/)
    expect(() => readVerifiedOpenReceipt(path, { ...binding, policySha: 'f'.repeat(40) }, 10_000)).toThrow(/stale or bound/)
    expect(() => readVerifiedOpenReceipt(path, { ...binding, fingerprint: 'f'.repeat(64) }, 10_000)).toThrow(/stale or bound/)
  })

  it('rechecks the embedded receipt and refuses links or shared files', () => {
    const path = written(), value = JSON.parse(readFileSync(path, 'utf8'))
    const tampered = join(root(), 'tampered.json')
    writeFileSync(tampered, JSON.stringify({ ...value, receipt: receipt({ sha: 'f'.repeat(40) }) }), { mode: 0o600 })
    expect(() => readVerifiedOpenReceipt(tampered, binding, 10_000)).toThrow(/complete same-channel/)
    const directory = root(), link = join(directory, 'link.json')
    symlinkSync(path, link)
    expect(() => readVerifiedOpenReceipt(link, binding, 10_000)).toThrow(/owner-private regular file/)
    const hard = join(directory, 'hard.json')
    linkSync(path, hard)
    expect(() => readVerifiedOpenReceipt(hard, binding, 10_000)).toThrow(/owner-private regular file/)
    const shared = written()
    chmodSync(shared, 0o644)
    expect(() => readVerifiedOpenReceipt(shared, binding, 10_000)).toThrow(/owner-private regular file/)
  })
})

describe('installed receipt continuity', () => {
  const carried = (continuity: Record<string, unknown> = { mainSha: 'f'.repeat(40), policyConfiguration: '9'.repeat(64) }) => receipt({ continuity })

  it('lets verify-open and open carry an earlier producer configuration for the installed candidate', () => {
    const output = join(root(), 'verified-open.json')
    verifyOpen(binding, output, () => carried(), 10_000)
    expect(readVerifiedOpenReceipt(output, binding, 10_000)).toEqual(carried())
    expect(() => admitReceipt(carried(), sha, 'open')).not.toThrow()
  })

  it('refuses a carried receipt, including a cached verify-open file, when open is strict', () => {
    const output = join(root(), 'verified-open.json')
    verifyOpen(binding, output, () => carried(), 10_000)
    expect(() => admitReceipt(readVerifiedOpenReceipt(output, binding, 10_000), sha, 'open', { strict: true })).toThrow(/--strict-producer true refuses/)
    expect(() => admitReceipt(receipt(), sha, 'open', { strict: true })).not.toThrow()
  })

  it.each(['deploy', 'restore'])('refuses a carried receipt for %s', action => {
    expect(() => admitReceipt(carried(), sha, action)).toThrow(/only reopens the installed candidate/)
    expect(() => admitReceipt(receipt(), sha, action)).not.toThrow()
  })

  it.each([
    ['an unchanged configuration', { mainSha: 'f'.repeat(40), policyConfiguration: 'b'.repeat(64) }],
    ['a short main SHA', { mainSha: 'f'.repeat(39), policyConfiguration: '9'.repeat(64) }],
    ['an extra field', { mainSha: 'f'.repeat(40), policyConfiguration: '9'.repeat(64), producerSha: 'f'.repeat(40) }],
  ])('rejects continuity with %s', (_, continuity) => {
    expect(() => admitReceipt(carried(continuity), sha, 'open')).toThrow(/Invalid installed receipt continuity/)
    expect(() => verifyOpen(binding, join(root(), 'verified-open.json'), () => carried(continuity))).toThrow(/Invalid installed receipt continuity/)
  })
})
