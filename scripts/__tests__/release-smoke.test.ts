import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createFailureRecorder, parseSmokeTarget } from '../release/smoke'

it.each(['http://localhost:5175', 'http://127.0.0.1:5175', 'http://[::1]:5175'])('allows loopback HTTP rehearsal at %s', origin => {
  const target = parseSmokeTarget(`${origin}/open-agricola/`, origin, 'selected-build')
  expect(target.appUrl).toBe(`${origin}/open-agricola/`)
  expect(target.apiUrl).toBe(origin)
  expect(target.buildId).toBe('selected-build')
})

it.each([
  'http://example.com', 'http://203.0.113.7:8080', 'http://[2001:db8::1]',
  'http://192.168.1.2', 'http://localhost.example.com', 'http://127.0.0.1.example.com',
])('rejects non-loopback HTTP credentials target %s', origin => {
  expect(() => parseSmokeTarget(`${origin}/open-agricola/`, origin, 'selected-build')).toThrow()
})

it.each(['https://example.com', 'https://203.0.113.7:8443'])('allows same-origin HTTPS release target %s', origin => {
  const target = parseSmokeTarget(`${origin}/open-agricola/`, origin, 'selected-build')
  expect(target.appUrl).toBe(`${origin}/open-agricola/`)
  expect(target.apiUrl).toBe(origin)
})

it('accepts the Pages root frontend and same-site API as separate origins', () => {
  expect(parseSmokeTarget('https://open-agricola.titanxxh.com/', 'https://openagapi.titanxxh.com', 'selected-build')).toEqual({
    appUrl: 'https://open-agricola.titanxxh.com/', apiUrl: 'https://openagapi.titanxxh.com', buildId: 'selected-build',
  })
})

it.each([
  ['https://user:secret@example.com/open-agricola/', 'https://example.com'],
  ['https://example.com/open-agricola/?token=secret', 'https://example.com'],
  ['https://example.com/open-agricola/', 'https://example.com?token=secret'],
  ['https://example.com/open-agricola/', 'https://other.example.net'],
  ['https://alice.github.io/', 'https://bob.github.io'],
  ['https://example.com/unknown/', 'https://example.com'],
])('rejects an unsafe hosted target %s with API %s', (app, api) => {
  expect(() => parseSmokeTarget(app, api, 'selected-build')).toThrow()
})

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
