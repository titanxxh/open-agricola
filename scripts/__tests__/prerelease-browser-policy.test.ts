import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { readBrowserAuthPolicy, readFormalBrowserDeployment, verifyFormalBrowserAcceptance } from '../prerelease/browser-policy'
import { formalBrowserPolicyFixture } from './prerelease-browser-policy-fixture'

it('reads the exact deployed formal API and Pages bytes without sending credentials', async () => {
  const fixture = await formalBrowserPolicyFixture()
  try {
    const result = await readFormalBrowserDeployment(fixture.formal, { ca: fixture.ca })
    expect(result).toMatchObject({ version: 2, buildId: fixture.state.buildId, ...fixture.formal,
      pages: { entryPath: '/assets/index-fixture.js', entrySha256: createHash('sha256').update('export const protectedBrowser = true').digest('hex') } })
    expect(fixture.headers.length).toBe(5)
    expect(fixture.headers.every(headers => headers.cookie === undefined && headers.authorization === undefined)).toBe(true)
    fixture.state.pagesBuildId = 'c'.repeat(40)
    await expect(readFormalBrowserDeployment(fixture.formal, { ca: fixture.ca })).rejects.toThrow('build identities differ')
  } finally { await fixture.close() }
})

it('opens only with fresh target-bound proof that still matches the deployed Pages and API', async () => {
  const fixture = await formalBrowserPolicyFixture()
  const scope = { targetId: 'prerelease-test', targetFingerprint: 'e'.repeat(64), origin: 'https://pre.agricola.test',
    buildId: 'a'.repeat(40), generation: 'bb4d6c82-676f-4dcc-a570-52377b3b32f5', operationId: 'cb4d6c82-676f-4dcc-a570-52377b3b32f5' }
  try {
    const deployment = await readFormalBrowserDeployment(fixture.formal, { ca: fixture.ca })
    const proof = { format: 1, ...scope, observedAt: Date.now(), deployment }
    expect(await verifyFormalBrowserAcceptance(fixture.formal, proof, scope, { ca: fixture.ca })).toEqual(deployment)
    for (const changed of [{ operationId: 'wrong' }, { generation: 'wrong' }, { buildId: 'c'.repeat(40) },
      { targetFingerprint: 'f'.repeat(64) }, { observedAt: Date.now() - 31 * 60_000 }]) {
      await expect(verifyFormalBrowserAcceptance(fixture.formal, { ...proof, ...changed }, scope, { ca: fixture.ca })).rejects.toThrow('different or expired')
    }
    await expect(verifyFormalBrowserAcceptance(fixture.formal, { ...proof, deployment: { ...deployment, pages: { ...deployment.pages, entrySha256: 'f'.repeat(64) } } }, scope, { ca: fixture.ca })).rejects.toThrow('changed after acceptance')
    fixture.state.buildId = fixture.state.pagesBuildId = 'c'.repeat(40)
    await expect(verifyFormalBrowserAcceptance(fixture.formal, proof, scope, { ca: fixture.ca })).rejects.toThrow('changed after acceptance')
  } finally { await fixture.close() }
})

it('rejects legacy, wrong-origin, redirected and untrusted TLS capabilities', async () => {
  const fixture = await formalBrowserPolicyFixture()
  try {
    await expect(readBrowserAuthPolicy(fixture.formal)).rejects.toThrow('connection failed')
    fixture.state.version = 1
    await expect(readBrowserAuthPolicy(fixture.formal, { ca: fixture.ca })).rejects.toThrow('incompatible')
    fixture.state.version = 2; fixture.state.originMismatch = true
    await expect(readBrowserAuthPolicy(fixture.formal, { ca: fixture.ca })).rejects.toThrow('incompatible')
    fixture.state.originMismatch = false; fixture.state.status = 302
    const before = fixture.headers.length
    await expect(readBrowserAuthPolicy(fixture.formal, { ca: fixture.ca })).rejects.toThrow('readback failed')
    expect(fixture.headers.length).toBe(before + 1)
  } finally { await fixture.close() }
})
