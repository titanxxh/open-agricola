import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { REQUIRED_EVIDENCE } from '../../prerelease/live-acceptance/evidence.mjs'

export const fixtureGeneration = '44444444-4444-4444-8444-444444444444'
const hash = (text: string) => createHash('sha256').update(text).digest('hex')

/** A full acceptance whose evidence was archived beside it while its recorded paths point at a removed exchange dir. */
export function fullAcceptanceFixture(root: string, { candidate = 'c'.repeat(40), image = 'sha256:image', formalBuild = 'a'.repeat(40), generation = fixtureGeneration,
  acceptedAt = Date.now() - 60_000, body = (item: string) => ({ format: 1, item, candidate, generation, formalBuild, passed: true, results: [] }) as Record<string, unknown> } = {}) {
  const directory = join(root, 'receipts'), evidence = join(directory, 'evidence')
  mkdirSync(evidence, { recursive: true, mode: 0o700 })
  const entries: Record<string, { path: string; sha256: string }> = Object.fromEntries(REQUIRED_EVIDENCE.filter(item => item !== 'formal-browser-policy').map(item => {
    const text = JSON.stringify(body(item)); writeFileSync(join(evidence, `${item}.json`), text, { mode: 0o600 })
    return [item, { path: `/tmp/oa-window-gone/evidence/${item}.json`, sha256: hash(text) }]
  }))
  entries['formal-browser-policy'] = { path: '/srv/pre/control/formal-browser-policy-op.json', sha256: 'f'.repeat(64) }
  const path = join(directory, 'acceptance.json')
  writeFileSync(path, JSON.stringify({ format: 1, channel: 'prerelease', targetId: 'prerelease-main', buildId: candidate, image, generation, operationId: 'op', acceptedAt, evidence: entries }), { mode: 0o600 })
  return path
}
