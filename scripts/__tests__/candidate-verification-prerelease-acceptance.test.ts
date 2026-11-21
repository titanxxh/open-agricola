import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkPrereleaseVerification } from '../ci/prerelease-acceptance'
import { verificationConfiguration } from '../ci/verification-tasks'
import { advanceMain, cleanupPrereleaseFixtures, passingRun, prereleaseFixture } from './_helpers/prerelease-candidate'

afterEach(cleanupPrereleaseFixtures)

describe('prerelease evidence acceptance', () => {
  it('admits an unmerged prerelease snapshot while reporting missing complete evidence', () => {
    const value = prereleaseFixture()
    const result = checkPrereleaseVerification(value.cwd, value.repository, value.sha)
    expect(result.status).toBe('blocked')
    expect(result.channel).toBe('prerelease')
    expect(result.tasks.every(task => task.reason === 'No verified task evidence')).toBe(true)
  })
})

describe('installed receipt continuity', () => {
  it('keeps an installed candidate verified by an ancestor producer whose configuration main has since changed', () => {
    const value = prereleaseFixture()
    passingRun(value, value.main, 60)
    expect(checkPrereleaseVerification(value.cwd, value.repository, value.sha).status).toBe('passed')
    const main = advanceMain(value, 'tsconfig.storage-tools.json')
    const strict = checkPrereleaseVerification(value.cwd, value.repository, value.sha)
    expect(strict.status).toBe('blocked')
    expect(strict).not.toHaveProperty('continuity')
    const carried = checkPrereleaseVerification(value.cwd, value.repository, value.sha, { continuity: true })
    expect(carried.status).toBe('passed')
    expect(carried.producerConfiguration).toBe(verificationConfiguration(value.cwd, value.main))
    expect(carried.continuity).toEqual({ mainSha: main, policyConfiguration: verificationConfiguration(value.cwd, main) })
    expect(carried.tasks.every(task => task.status === 'passed' && task.runId === 60)).toBe(true)
  })

  it('prefers current-configuration evidence and reports no continuity when it is complete', () => {
    const value = prereleaseFixture()
    passingRun(value, value.main, 60)
    const result = checkPrereleaseVerification(value.cwd, value.repository, value.sha, { continuity: true })
    expect(result.status).toBe('passed')
    expect(result).not.toHaveProperty('continuity')
  })

  it('still requires complete successful evidence and an ancestor producer', () => {
    const value = prereleaseFixture()
    const { jobs } = passingRun(value, value.main, 60)
    advanceMain(value, 'tsconfig.storage-tools.json')
    jobs[3].conclusion = 'failure'; value.save()
    expect(checkPrereleaseVerification(value.cwd, value.repository, value.sha, { continuity: true }).status).toBe('blocked')

    const other = prereleaseFixture()
    other.git('checkout', '-q', '-b', 'side', other.main)
    writeFileSync(join(other.cwd, 'package.json'), '{"side":true}')
    other.git('add', '.'); other.git('commit', '-m', 'unmerged producer')
    const side = other.git('rev-parse', 'HEAD')
    other.git('checkout', '-q', 'prerelease')
    passingRun(other, side, 61)
    advanceMain(other, 'tsconfig.storage-tools.json')
    expect(checkPrereleaseVerification(other.cwd, other.repository, other.sha, { continuity: true }).status).toBe('blocked')
  })
})

describe('owner policy producer for source updates', () => {
  it('keeps evidence produced under the owner policy after main changes its verification configuration', () => {
    const value = prereleaseFixture()
    passingRun(value, value.main, 70)
    advanceMain(value, 'tsconfig.storage-tools.json')
    expect(checkPrereleaseVerification(value.cwd, value.repository, value.sha).status).toBe('blocked')
    const owner = checkPrereleaseVerification(value.cwd, value.repository, value.sha, { producerSha: value.main })
    expect(owner.status).toBe('passed')
    expect(owner.producerConfiguration).toBe(verificationConfiguration(value.cwd, value.main))
    expect(owner).not.toHaveProperty('continuity')
    expect(owner.tasks.every(task => task.status === 'passed' && task.runId === 70)).toBe(true)
  })

  it('reports a run still in progress under the owner policy so a waiting update does not request another', () => {
    const value = prereleaseFixture()
    const { jobs } = passingRun(value, value.main, 71)
    const runs = value.api[`repos/${value.repository}/actions/workflows/200/runs?event=workflow_dispatch&per_page=100`] as { id: number; status: string }[]
    runs.find(run => run.id === 71)!.status = 'in_progress'
    jobs[1].status = 'in_progress'; jobs[1].conclusion = null as unknown as string; jobs[1].completed_at = null as unknown as string
    value.save()
    advanceMain(value, 'tsconfig.storage-tools.json')
    expect(checkPrereleaseVerification(value.cwd, value.repository, value.sha).tasks.every(task => task.runId === null)).toBe(true)
    const owner = checkPrereleaseVerification(value.cwd, value.repository, value.sha, { producerSha: value.main })
    expect(owner.status).toBe('blocked')
    expect(owner.tasks.some(task => task.runId === 71)).toBe(true)
    expect(owner.tasks.filter(task => task.runId === null)).toEqual([])
  })

  it('falls back to the current configuration when owner-policy evidence lacks a task without a run', () => {
    const value = prereleaseFixture()
    const { jobs } = passingRun(value, value.main, 73)
    const listing = value.api[`repos/${value.repository}/actions/runs/73/jobs?filter=all&per_page=100`] as { id: number }[]
    value.api[`repos/${value.repository}/actions/runs/73/jobs?filter=all&per_page=100`] = listing.filter(job => job.id !== jobs[2].id)
    value.save()
    advanceMain(value, 'tsconfig.storage-tools.json')
    const result = checkPrereleaseVerification(value.cwd, value.repository, value.sha, { producerSha: value.main })
    expect(result.status).toBe('blocked')
    // Every task is missing under the current configuration, so a waiting update requests a complete current run.
    expect(result.tasks.every(task => task.runId === null)).toBe(true)
  })

  it('refuses an owner policy commit outside protected main', () => {
    const value = prereleaseFixture()
    value.git('checkout', '-q', '-b', 'side', value.main)
    writeFileSync(join(value.cwd, 'package.json'), '{"side":true}')
    value.git('add', '.'); value.git('commit', '-m', 'unmerged policy')
    const side = value.git('rev-parse', 'HEAD')
    value.git('checkout', '-q', 'prerelease')
    passingRun(value, side, 72)
    expect(() => checkPrereleaseVerification(value.cwd, value.repository, value.sha, { producerSha: side })).toThrow(/not reachable from protected main/)
  })
})
