import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkPrereleaseVerification } from '../ci/prerelease-acceptance'
import { fixPrereleaseCandidate, syncPrerelease, validateIntegrationManifest } from '../ci/prerelease-admission'
import { requestPrereleaseVerification } from '../ci/prerelease-execution'
import { advanceMain, cleanupPrereleaseFixtures, prereleaseFixture, synchronizationFixture } from './_helpers/prerelease-candidate'

afterEach(cleanupPrereleaseFixtures)

describe('fixed prerelease candidates', () => {
  it('pins the live integration head with an earlier reachable baseline only for the source path', () => {
    const value = prereleaseFixture()
    const current = advanceMain(value, 'new-main.txt')
    delete value.api[`repos/${value.repository}/git/ref/heads/${value.fixedRef}`]
    value.save()
    expect(() => fixPrereleaseCandidate(value.cwd, value.repository, value.sha)).toThrow(/baseline/)
    expect(fixPrereleaseCandidate(value.cwd, value.repository, value.sha, { allowEarlierBaseline: true }).main).toBe(current)
    expect(value.calls().flatMap(call => call.body ?? [])).toContainEqual({ ref: `refs/heads/${value.fixedRef}`, sha: value.sha })
  })

  it('rejects a baseline outside the protected main lineage before creating a pin', () => {
    const value = prereleaseFixture()
    delete value.api[`repos/${value.repository}/git/ref/heads/${value.fixedRef}`]
    value.git('checkout', '--orphan', 'unrelated')
    value.git('commit', '-m', 'unrelated main')
    value.api[`repos/${value.repository}/git/ref/heads/main`] = { ref: 'refs/heads/main', object: { type: 'commit', sha: value.git('rev-parse', 'HEAD') } }
    value.save()
    expect(() => fixPrereleaseCandidate(value.cwd, value.repository, value.sha, { allowEarlierBaseline: true })).toThrow(/outside protected main/)
    expect(value.calls().filter(call => call.body)).toEqual([])
  })

  it('keeps a fixed candidate eligible after the mutable integration ref advances', () => {
    const value = prereleaseFixture()
    value.api[`repos/${value.repository}/git/ref/heads/prerelease`] = { ref: 'refs/heads/prerelease', object: { type: 'commit', sha: value.main } }
    value.save()
    expect(checkPrereleaseVerification(value.cwd, value.repository, value.sha).status).toBe('blocked')
  })

  it.each(['fixed SHA', 'immutable protection', 'main protection'])('rejects wrong %s before requesting a workflow', failure => {
    const value = prereleaseFixture()
    if (failure === 'fixed SHA') value.api[`repos/${value.repository}/git/ref/heads/verification/prerelease/${value.sha}`] = { object: { type: 'commit', sha: value.main } }
    else if (failure === 'immutable protection') value.api[`repos/${value.repository}/rules/branches/${encodeURIComponent(value.fixedRef)}?per_page=100`] = []
    else {
      value.api[`repos/${value.repository}/rules/branches/main?per_page=100`] = []
      value.api[`repos/${value.repository}/branches/main/protection`] = {}
    }
    value.save()
    expect(() => requestPrereleaseVerification(value.cwd, value.repository, value.sha, 'all')).toThrow()
    expect(value.calls().filter(call => call.body)).toEqual([])
  })

  it('rejects a stale integration base and unknown feature dependencies', () => {
    const value = prereleaseFixture()
    expect(() => validateIntegrationManifest(value.cwd, value.repository, value.sha, value.main)).not.toThrow()
    expect(() => validateIntegrationManifest(value.cwd, value.repository, value.sha, value.feature)).toThrow(/baseline/)
    value.manifest.features[0].dependsOn.push('missing')
    writeFileSync(join(value.cwd, 'prerelease-integration.json'), JSON.stringify(value.manifest))
    value.git('add', '.'); value.git('commit', '-m', 'bad dependency')
    expect(() => validateIntegrationManifest(value.cwd, value.repository, value.git('rev-parse', 'HEAD'), value.main)).toThrow(/dependency/)
  })

  it('refuses a lease conflict without invoking git push', () => {
    const value = prereleaseFixture()
    expect(() => syncPrerelease(value.cwd, value.repository, value.sha, value.main, value.main)).toThrow(/lease/)
  })
})

describe('owner main synchronization with an exact Git lease', () => {
  it('updates only prerelease and keeps release tags and immutable candidates fixed', () => {
    const value = synchronizationFixture()
    value.install()
    syncPrerelease(value.cwd, value.repository, value.sha, value.old, value.main)
    expect(JSON.parse(readFileSync(value.log, 'utf8'))).toEqual(['push', `--force-with-lease=refs/heads/prerelease:${value.old}`,
      `https://github.com/${value.repository}.git`, `${value.sha}:refs/heads/prerelease`])
    expect(value.ref('refs/heads/prerelease')).toBe(value.sha)
    expect(value.ref('refs/heads/main')).toBe(value.main)
    expect(value.ref(`refs/heads/${value.fixedRef}`)).toBe(value.old)
    expect(value.ref('refs/tags/v9.9.9-beta.1')).toBe(value.old)
  })

  it('lets Git reject a concurrent update after the initial API read without overwriting it', () => {
    const value = synchronizationFixture()
    value.install(true)
    expect(() => syncPrerelease(value.cwd, value.repository, value.sha, value.old, value.main)).toThrow()
    expect(value.ref('refs/heads/prerelease')).toBe(value.main)
    expect(value.ref(`refs/heads/${value.fixedRef}`)).toBe(value.old)
  })

  it('refuses feature additions or removals through the synchronization exception', () => {
    const value = synchronizationFixture()
    value.manifest.features[0].id = 'unreviewed-replacement'
    writeFileSync(join(value.cwd, 'prerelease-integration.json'), JSON.stringify(value.manifest))
    value.git('add', '.'); value.git('commit', '-m', 'feature replacement')
    expect(() => syncPrerelease(value.cwd, value.repository, value.git('rev-parse', 'HEAD'), value.old, value.main)).toThrow(/reviewed PR/)
    expect(value.ref('refs/heads/prerelease')).toBe(value.old)
  })
})
