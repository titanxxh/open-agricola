// Owner-only acceptance evidence: one summary per required item, built from label-only suite results.
import { createHash } from 'node:crypto'
import { chmodSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertNoAccountValues } from './context.mjs'
import { REQUIRED_CASES } from './suites.mjs'

export const REQUIRED_EVIDENCE = ['identity', 'beta-access', 'http-ws', 'public-cards', 'viewer', 'retained-data', 'deletion-audit', 'capacity', 'formal-unaffected', 'browser-boundary', 'formal-browser-policy']
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex')

/** Which suite results support each item; formal-browser-policy comes from the target's own verifier. */
export const SOURCES = {
  identity: ['handoff'], 'beta-access': ['revocation', 'multihand-cooperation-viewer', 'formal-account-deletion'],
  'http-ws': ['visitor', 'ordinary', 'beta-boundary', 'team-game'], 'public-cards': ['public-sandbox'],
  viewer: ['multihand-cooperation-viewer', 'viewer-firefox', 'viewer-webkit', 'continuity'], 'retained-data': ['continuity'],
  'deletion-audit': ['formal-account-deletion'], 'browser-boundary': ['beta-boundary'],
}

/**
 * Reads every result file in the run directories; the newest result per (case, engine) wins. A single-case rerun
 * therefore replaces only its own cases. Files are read in `--runs` order, then by name (`result-<suite>-<engine>-<ms>`).
 */
export function collectResults(directories) {
  const latest = new Map()
  for (const directory of directories) for (const name of readdirSync(directory).filter(file => /^result-.+\.json$/.test(file)).sort()) {
    const path = join(directory, name), value = JSON.parse(readFileSync(path, 'utf8'))
    for (const result of value.results ?? []) latest.set(`${result.case}:${value.engine}`, { path, engine: value.engine, run: value, result })
  }
  return [...latest.values()]
}

/**
 * Writes one summary per item into `output` and returns { item: { path, sha256 } }. `extra` carries owner-collected
 * inputs (capacity snapshot, formal checks, deletion counts, notes) keyed by item.
 */
export function bundleEvidence({ results, output, common, accounts, extra = {} }) {
  const index = {}
  for (const item of REQUIRED_EVIDENCE.filter(name => name !== 'formal-browser-policy')) {
    const rows = results.filter(row => (SOURCES[item] ?? []).includes(row.result.case))
    // Every required (case, engine) pair needs its own newest result; a case that never ran blocks the item.
    const missing = REQUIRED_CASES.filter(pair => (SOURCES[item] ?? []).includes(pair.case)
      && !rows.some(row => row.result.case === pair.case && row.engine === pair.engine))
    const body = { format: 1, item, ...common,
      passed: missing.length === 0 && (rows.length > 0 ? rows.every(row => row.result.passed === true) : (extra[item] ? extra[item].passed !== false : false)),
      ...(missing.length ? { missing } : {}),
      results: rows.map(row => ({ engine: row.engine, version: row.run.version, case: row.result.case, passed: row.result.passed, result: row.result, source: { path: row.path, sha256: sha256(row.path) } })),
      ...(extra[item] ? { owner: extra[item] } : {}) }
    const text = JSON.stringify(body, null, 1)
    assertNoAccountValues(accounts, text, item)
    const path = join(output, `${item}.json`); writeFileSync(path, text + '\n', { mode: 0o600 }); chmodSync(path, 0o600)
    index[item] = { path, sha256: sha256(path), passed: body.passed }
  }
  return index
}

/** The acceptance file `open` verifies; it must be written within 30 minutes of opening. */
export function acceptanceRecord({ targetId, status, healthyCycle, index, formalBrowser }) {
  const evidence = Object.fromEntries(Object.entries(index).map(([item, entry]) => [item, { path: entry.path, sha256: entry.sha256 }]))
  evidence['formal-browser-policy'] = { path: formalBrowser.path, sha256: formalBrowser.sha256 }
  for (const item of REQUIRED_EVIDENCE) if (!evidence[item]) throw new Error(`Missing acceptance evidence: ${item}`)
  return { format: 1, channel: 'prerelease', targetId, targetFingerprint: status.fingerprint, buildId: status.installed.buildId,
    image: status.installed.image, generation: status.generation, operationId: status.operation.id, acceptedAt: Date.now(), healthyCycle, evidence }
}
