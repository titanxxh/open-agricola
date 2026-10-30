import { describe, expect, it } from 'vitest'
import { assertRoutineGate } from '../ci/routine-verification-gate'

const sha = '1'.repeat(40)
const digest = '2'.repeat(64)
const ids = ['units', 'browser-1', 'browser-2', 'browser-3', 'browser-4']
const hashes: Record<string, string> = {
  units: '3'.repeat(64), 'browser-1': '4'.repeat(64), 'browser-2': '5'.repeat(64),
  'browser-3': '6'.repeat(64), 'browser-4': '7'.repeat(64),
}
type Needs = Record<string, { result: string; outputs: Record<string, string> }>
const manifest = (selected = ['units']) => Object.fromEntries(ids.map(id => [id,
  selected.includes(id) ? { id, digest: hashes[id], checks: id === 'units' ? 1 : 2 } : null,
]))
function evidence(selected = ['units']): Needs {
  const needs: Needs = {
    plan: { result: 'success', outputs: { mode: 'scoped', plan_digest: digest, tested_sha: sha,
      partitions: JSON.stringify(manifest(selected)), catalog_tasks: 'none' } },
    catalog: { result: 'skipped', outputs: {} },
  }
  for (const id of ids) needs[id] = selected.includes(id)
    ? { result: 'success', outputs: { status: 'passed', partition_id: id, partition_digest: hashes[id],
      plan_digest: digest, tested_sha: sha, completed_checks: id === 'units' ? '1' : '2' } }
    : { result: 'skipped', outputs: {} }
  return needs
}

describe('required routine verification gate', () => {
  it('accepts documentation units and explicit skipped browser and catalog branches', () => {
    expect(assertRoutineGate({ sha, needs: evidence() })).toEqual({ status: 'passed', mode: 'scoped', sha, planDigest: digest })
  })

  it('accepts every selected partition only after its own checks complete', () => {
    expect(assertRoutineGate({ sha, needs: evidence(ids) }).status).toBe('passed')
  })

  it('blocks missing catalog selection when GitHub omits an empty job output', () => {
    const needs = evidence()
    delete needs.plan.outputs.catalog_tasks
    expect(() => assertRoutineGate({ sha, needs })).toThrow('Missing verification job output')
  })

  it('rejects an empty catalog output instead of treating it as intentional', () => {
    const needs = evidence()
    needs.plan.outputs.catalog_tasks = ''
    expect(() => assertRoutineGate({ sha, needs })).toThrow()
  })

  it.each(['failure', 'cancelled', 'skipped'])('blocks planning with result %s', result => {
    const needs = evidence()
    needs.plan.result = result
    expect(() => assertRoutineGate({ sha, needs })).toThrow('planning did not succeed')
  })

  it.each(ids.flatMap(id => ['failure', 'cancelled', 'skipped'].map(result => ({ id, result }))))(
    'cannot mask selected $id result $result with other successful partitions', ({ id, result }) => {
      const needs = evidence(ids)
      needs[id].result = result
      expect(() => assertRoutineGate({ sha, needs })).toThrow(`Selected ${id} partition`)
    },
  )

  it.each(ids)('rejects a missing selected %s caller', id => {
    const needs = evidence(ids)
    delete needs[id]
    expect(() => assertRoutineGate({ sha, needs })).toThrow('Missing or invalid verification job evidence')
  })

  it.each(ids)('binds %s to its own identity, digest, complete count, plan and checkout', id => {
    for (const change of [
      { status: 'failed' }, { partition_id: 'another-slot' }, { partition_digest: '8'.repeat(64) },
      { plan_digest: '9'.repeat(64) }, { tested_sha: 'a'.repeat(40) }, { completed_checks: '0' }, { completed_checks: '999' },
    ]) {
      const needs = evidence(ids)
      Object.assign(needs[id].outputs, change)
      expect(() => assertRoutineGate({ sha, needs })).toThrow(`Selected ${id} partition`)
    }
    const needs = evidence(ids)
    needs[id].outputs = {}
    expect(() => assertRoutineGate({ sha, needs })).toThrow()
  })

  it.each(['browser-1', 'browser-2', 'browser-3', 'browser-4'])('requires the intentionally unselected %s caller to be skipped', id => {
    const needs = evidence()
    needs[id].result = 'success'
    expect(() => assertRoutineGate({ sha, needs })).toThrow(`unselected ${id} partition`)
    delete needs[id]
    expect(() => assertRoutineGate({ sha, needs })).toThrow('Missing or invalid verification job evidence')
  })

  it('rejects missing, unknown, malformed and incomplete partition manifests', () => {
    const allEmpty = manifest([])
    const missing = { ...allEmpty }
    delete missing['browser-4']
    for (const partitions of [
      '', 'null', JSON.stringify(missing), JSON.stringify({ ...allEmpty, extra: null }),
      JSON.stringify({ ...allEmpty, units: { id: 'browser-1', digest: hashes.units, checks: 1 } }),
      JSON.stringify({ ...allEmpty, units: { id: 'units', digest: 'bad', checks: 1 } }),
      JSON.stringify({ ...allEmpty, units: { id: 'units', digest: hashes.units, checks: 0 } }),
    ]) {
      const needs = evidence()
      needs.plan.outputs.partitions = partitions
      expect(() => assertRoutineGate({ sha, needs })).toThrow()
    }
    const needs = evidence()
    delete needs.plan.outputs.partitions
    expect(() => assertRoutineGate({ sha, needs })).toThrow('Missing verification job output')
  })

  it('requires the selected catalog tasks to complete for the same checkout', () => {
    const needs = evidence()
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

  it('allows full fallback only with the complete catalog and every scoped slot skipped', () => {
    const tasks = 'quality,fast,slow,build,chromium-1,chromium-2,chromium-3,chromium-4,browser-sandbox,webkit'
    const needs = evidence([])
    needs.plan.outputs.mode = 'full'
    needs.plan.outputs.catalog_tasks = tasks
    needs.catalog = { result: 'success', outputs: { verified_tasks: tasks, verified_sha: sha } }
    expect(assertRoutineGate({ sha, needs }).mode).toBe('full')
    needs.plan.outputs.catalog_tasks = 'quality,fast'
    expect(() => assertRoutineGate({ sha, needs })).toThrow('every canonical task')
    needs.plan.outputs.catalog_tasks = tasks
    needs.plan.outputs.partitions = JSON.stringify(manifest())
    expect(() => assertRoutineGate({ sha, needs })).toThrow('every canonical task')
  })

  it('never accepts an empty plan or unexpected execution of an unselected catalog', () => {
    expect(() => assertRoutineGate({ sha, needs: evidence([]) })).toThrow('empty or noncanonical')
    expect(() => assertRoutineGate({ sha, needs: { ...evidence(), catalog: { result: 'success', outputs: {} } } })).toThrow('unselected catalog')
  })
})
