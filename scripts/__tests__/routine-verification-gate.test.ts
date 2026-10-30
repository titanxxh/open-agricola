import { describe, expect, it } from 'vitest'
import { assertRoutineGate } from '../ci/routine-verification-gate'

const sha = '1'.repeat(40)
const digest = '2'.repeat(64)
const documentation = () => ({
  plan: { result: 'success', outputs: { mode: 'scoped', plan_digest: digest, tested_sha: sha, inline_checks: '1', catalog_tasks: '' } },
  inline: { result: 'success', outputs: { status: 'passed', plan_digest: digest, tested_sha: sha, completed_checks: '1' } },
  catalog: { result: 'skipped', outputs: { verified_tasks: '', verified_sha: '' } },
})

describe('required routine verification gate', () => {
  it('accepts completed documentation constraints and an intentionally unselected catalog branch', () => {
    expect(assertRoutineGate({ sha, needs: documentation() })).toEqual({ status: 'passed', mode: 'scoped', sha, planDigest: digest })
  })

  it.each(['failure', 'cancelled', 'skipped'])('blocks a selected inline branch with result %s', result => {
    const needs = documentation()
    needs.inline.result = result
    expect(() => assertRoutineGate({ sha, needs })).toThrow('Selected inline checks')
  })

  it.each(['failure', 'cancelled', 'skipped'])('blocks planning with result %s', result => {
    const needs = documentation()
    needs.plan.result = result
    expect(() => assertRoutineGate({ sha, needs })).toThrow('planning did not succeed')
  })

  it('rejects missing jobs, missing or incomplete execution, a changed plan, and a different checkout', () => {
    expect(() => assertRoutineGate({ sha, needs: { ...documentation(), inline: undefined } })).toThrow()
    for (const outputs of [
      {}, { ...documentation().inline.outputs, completed_checks: '0' },
      { ...documentation().inline.outputs, plan_digest: '3'.repeat(64) },
      { ...documentation().inline.outputs, tested_sha: '4'.repeat(40) },
    ]) {
      expect(() => assertRoutineGate({ sha, needs: { ...documentation(), inline: { result: 'success', outputs } } })).toThrow()
    }
  })

  it('requires the selected catalog tasks to have actually completed for the same checkout', () => {
    const needs = documentation()
    needs.plan.outputs.catalog_tasks = 'quality,build'
    needs.catalog = { result: 'success', outputs: { verified_tasks: 'quality,build', verified_sha: sha } }
    expect(assertRoutineGate({ sha, needs }).status).toBe('passed')
    for (const result of ['failure', 'cancelled', 'skipped']) {
      expect(() => assertRoutineGate({ sha, needs: { ...needs, catalog: { ...needs.catalog, result } } })).toThrow('Selected catalog tasks')
    }
    for (const outputs of [{}, { verified_tasks: 'quality', verified_sha: sha }, { verified_tasks: 'quality,build', verified_sha: '3'.repeat(40) }]) {
      expect(() => assertRoutineGate({ sha, needs: { ...needs, catalog: { result: 'success', outputs } } })).toThrow('Selected catalog tasks')
    }
  })

  it('allows full fallback only when the entire canonical task set completes', () => {
    const tasks = 'quality,fast,slow,build,chromium-1,chromium-2,chromium-3,chromium-4,browser-sandbox,webkit'
    const needs = {
      plan: { result: 'success', outputs: { mode: 'full', plan_digest: digest, tested_sha: sha, inline_checks: '0', catalog_tasks: tasks } },
      inline: { result: 'skipped', outputs: {} },
      catalog: { result: 'success', outputs: { verified_tasks: tasks, verified_sha: sha } },
    }
    expect(assertRoutineGate({ sha, needs }).mode).toBe('full')
    needs.plan.outputs.catalog_tasks = 'quality,fast'
    needs.catalog.outputs.verified_tasks = 'quality,fast'
    expect(() => assertRoutineGate({ sha, needs })).toThrow('every canonical task')
  })

  it('never accepts an empty plan or an unexpected execution of an unselected branch', () => {
    const needs = documentation()
    needs.plan.outputs.inline_checks = '0'
    expect(() => assertRoutineGate({ sha, needs })).toThrow('empty or noncanonical')
    expect(() => assertRoutineGate({ sha, needs: { ...documentation(), catalog: { result: 'success', outputs: {} } } })).toThrow('unselected catalog')
  })
})
