import { mkdirSync, writeFileSync } from 'node:fs'
import { assertPrivateReadDenials } from './container-image-build-registry.ts'

const references = [
  'trusted-policy-7bff2eb76bd9a5e6516c91f0c3499041dbfb0218-43383937075-1',
  'sha256:74d8508640715e6954ffd7c2b20938aed2f6c40bcf9094d5f0ce513936199ae6',
]
const tokenEndpoint = 'https://ghcr.io/token?service=ghcr.io&scope=repository:titanxxh/open-agricola-images:pull'
const knownErrors = new Set([
  'Registry access probe failed; inspect owner package setup',
  'Registry returned no scoped token',
  'Invalid registry metadata',
  'Cannot establish access to the known registry version; inspect owner package setup',
  'Private image permits anonymous reads',
  'Private image grants this public repository access; review Actions/Codespaces package setup',
  'Probe attempted an unexpected request',
])
type Observation = {
  stage: 'token' | 'manifest'; access: 'anonymous' | 'repository'
  status: number; contentType: string | null
}
type Outcome = { kind: 'denials-confirmed' } | { kind: 'check-failed'; reason: string }
const results: { reference: string; observations: Observation[]; outcome: Outcome }[] = []
const probeToken = process.env.GH_TOKEN
if (!probeToken || process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
  || process.env.GITHUB_REPOSITORY !== 'titanxxh/open-agricola') {
  throw new Error('This diagnostic requires the dedicated repository workflow dispatch')
}

const realFetch = globalThis.fetch
for (const reference of references) {
  const observations: Observation[] = []
  let tokenRequests = 0
  let access: Observation['access'] = 'anonymous'
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const stage = url === tokenEndpoint ? 'token' : 'manifest'
    if ((init?.method ?? (input instanceof Request ? input.method : 'GET')) !== 'GET'
      || (url !== tokenEndpoint && url !== `https://ghcr.io/v2/titanxxh/open-agricola-images/manifests/${reference}`)) {
      throw new Error('Probe attempted an unexpected request')
    }
    if (stage === 'token') {
      tokenRequests += 1
      if (tokenRequests > 2) throw new Error('Probe attempted an unexpected request')
      access = tokenRequests === 1 ? 'anonymous' : 'repository'
    }
    const response = await realFetch(input, init)
    observations.push({ stage, access, status: response.status, contentType: response.headers.get('content-type')?.slice(0, 128) ?? null })
    return response
  }
  let outcome: Outcome
  try {
    await assertPrivateReadDenials(reference, { publishToken: '', probeToken, publisher: 'titanxxh', expectedPackageId: '16851859' })
    outcome = { kind: 'denials-confirmed' }
  } catch (error) {
    outcome = { kind: 'check-failed', reason: error instanceof Error && knownErrors.has(error.message) ? error.message : 'Unexpected failure; details omitted' }
  } finally {
    globalThis.fetch = realFetch
  }
  results.push({ reference, observations, outcome })
}
mkdirSync('output/verification', { recursive: true })
writeFileSync('output/verification/registry-read-probe.json', JSON.stringify({
  runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT, head: process.env.GITHUB_SHA, results,
}, null, 2) + '\n')
process.stdout.write('Registry read probe completed; only bounded response metadata was retained.\n')
if (results.some(result => result.outcome.kind === 'check-failed')) process.exitCode = 1
