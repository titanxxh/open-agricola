import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createFailureRecorder } from '../release/smoke'

it('retains the first failure when cleanup also fails and never writes arbitrary error text', () => {
  const directory = mkdtempSync(join(tmpdir(), 'release-failure-'))
  try {
    const record = createFailureRecorder(directory, () => ({ entries: [], dropped: 0 }))
    const primary = record('login', new TypeError('password-secret session-secret'))
    const original = readFileSync(join(directory, 'failure.json'), 'utf8')
    const cleanup = record('logout', new Error('cookie-secret'))
    expect(primary.primary).toBe(true); expect(cleanup.primary).toBe(false)
    expect(cleanup.error).toBe(primary.error)
    expect(readFileSync(join(directory, 'failure.json'), 'utf8')).toBe(original)
    expect(JSON.parse(original)).toEqual({ stage: 'login', errorCategory: 'TypeError', diagnostics: { entries: [], dropped: 0 } })
    const secondary = readFileSync(join(directory, 'cleanup-failure.json'), 'utf8')
    expect(JSON.parse(secondary)).toEqual({ stage: 'logout', errorCategory: 'Error', diagnostics: { entries: [], dropped: 0 } })
    expect(record('browser-smoke', primary.error).error).toBe(primary.error)
    expect(readFileSync(join(directory, 'cleanup-failure.json'), 'utf8')).toBe(secondary)
    expect(original + secondary).not.toMatch(/password-secret|session-secret|cookie-secret/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

it('shares one first failure across browser, CLI database and cleanup stages', () => {
  const directory = mkdtempSync(join(tmpdir(), 'release-cli-failure-'))
  try {
    const record = createFailureRecorder(directory, () => ({ entries: [], dropped: 0 }))
    const initial = record('durability', new Error('database-credential-secret'))
    const original = readFileSync(join(directory, 'failure.json'), 'utf8')
    expect(record('close-database', new Error('cookie-secret')).error).toBe(initial.error)
    expect(record('close-browser', new Error('token-secret')).error).toBe(initial.error)
    expect(readFileSync(join(directory, 'failure.json'), 'utf8')).toBe(original)
    expect(JSON.parse(original)).toMatchObject({ stage: 'durability', errorCategory: 'Error' })
    expect(original + readFileSync(join(directory, 'cleanup-failure.json'), 'utf8')).not.toMatch(/credential-secret|cookie-secret|token-secret/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
