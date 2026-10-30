import { describe, expect, it } from 'vitest'
import { evaluateCandidateVerification, parseGitHubJsonLines } from '../ci/candidate-verification'

const sha = 'a'.repeat(40)
const configuration = 'b'.repeat(64)
const tasks = ['quality', 'fast', 'slow', 'build', 'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit']
const identity = { repository: 'titanxxh/open-agricola', sha, configuration, workflowId: 100 }
const step = (name: string, conclusion = 'success') => ({ name, status: 'completed', conclusion })
const timing = (started_at: string | null, completed_at: string | null) => ({ started_at, completed_at })
const job = (name: string, id: number) => ({ id, run_id: 1, name, status: 'completed', conclusion: 'success', run_attempt: 1,
  created_at: '2026-10-30T00:05:00Z', ...timing('2026-10-30T00:05:00Z', '2026-10-30T00:10:00Z'),
  html_url: `https://github.com/titanxxh/open-agricola/actions/runs/1/job/${id}`,
  steps: [step('Checkout candidate'), step('Install dependencies'), step('Verify candidate checkout'), step('Execute verification task'), step('Install browsers')],
})

function evidence() {
  return {
    run: { id: 1, workflow_id: 100, path: '.github/workflows/candidate-verification.yml', event: 'workflow_dispatch',
      head_sha: sha, repository: { full_name: 'titanxxh/open-agricola' }, status: 'completed',
      created_at: '2026-10-30T00:00:00Z', updated_at: '2026-10-30T00:15:00Z',
      run_attempt: 1, html_url: 'https://github.com/titanxxh/open-agricola/actions/runs/1' },
    jobs: [
      { ...job('candidate-manifest', 1), created_at: '2026-10-30T00:00:00Z',
        ...timing('2026-10-30T00:00:00Z', '2026-10-30T00:01:00Z'),
        steps: [step('Generate candidate manifest'), step(`Candidate manifest / ${sha} / ${configuration} / ${tasks.join(',')}`)] },
      ...tasks.map((task, index) => job(`candidate / ${task} / ${configuration}`, index + 2)),
    ],
  }
}

function laterEvidence() {
  const value = evidence()
  value.run.id = 2
  value.run.created_at = '2026-10-30T01:00:00Z'
  value.run.updated_at = '2026-10-30T01:15:00Z'
  for (const job of value.jobs) {
    job.run_id = 2
    job.id += 100
    job.created_at = job.created_at.replace('T00:', 'T01:')
    job.started_at = job.started_at?.replace('T00:', 'T01:') ?? null
    job.completed_at = job.completed_at?.replace('T00:', 'T01:') ?? null
  }
  return value
}

function fastOnlyEvidence() {
  const value = laterEvidence()
  value.jobs = [value.jobs[0], value.jobs[2]]
  value.jobs[0].steps[1].name = `Candidate manifest / ${sha} / ${configuration} / fast`
  return value
}

describe('GitHub full candidate verification evidence', () => {
  it('passes only after all complete candidate jobs actually succeeded', () => {
    const result = evaluateCandidateVerification(identity, [evidence()])
    expect(result.status).toBe('passed')
    expect(result.tasks.map(task => [task.id, task.status])).toEqual([
      ['quality', 'passed'], ['fast', 'passed'], ['slow', 'passed'], ['build', 'passed'],
      ['chromium-1', 'passed'], ['chromium-2', 'passed'], ['chromium-3', 'passed'], ['chromium-4', 'passed'],
      ['browser-sandbox', 'passed'], ['webkit', 'passed'],
    ])
  })

  it('rejects successful task metadata copied from a different run', () => {
    const value = evidence()
    value.jobs[1].run_id = 999
    expect(evaluateCandidateVerification(identity, [value]).status).toBe('blocked')
  })

  it.each(['failure', 'cancelled', 'skipped', 'timed_out'])('blocks a required task with conclusion %s', (status) => {
    const value = evidence()
    value.jobs[2].conclusion = status
    const result = evaluateCandidateVerification(identity, [value])
    expect(result.status).toBe('blocked')
    expect(result.tasks.filter(task => task.status === 'blocked').map(task => task.id)).toEqual(['fast'])
  })

  it('blocks missing tasks instead of treating a partially green run as complete', () => {
    const value = evidence()
    value.jobs = value.jobs.filter(job => !job.name.startsWith('candidate / webkit /'))
    const result = evaluateCandidateVerification(identity, [value])
    expect(result.status).toBe('blocked')
    expect(result.tasks.at(-1)?.reason).toBe('Required candidate task was not run')
  })

  it('blocks a successful job whose actual test step was skipped', () => {
    const value = evidence()
    value.jobs[2].steps[3].conclusion = 'skipped'
    expect(evaluateCandidateVerification(identity, [value]).tasks[1].status).toBe('blocked')
  })

  it('blocks a browser job that did not install its required browser', () => {
    const value = evidence()
    value.jobs[10].steps = value.jobs[10].steps.filter(step => step.name !== 'Install browsers')
    expect(evaluateCandidateVerification(identity, [value]).tasks.at(-1)?.status).toBe('blocked')
  })

  it.each([
    ['SHA', (value: ReturnType<typeof evidence>) => { value.run.head_sha = 'c'.repeat(40) }],
    ['repository', (value: ReturnType<typeof evidence>) => { value.run.repository.full_name = 'someone/fork' }],
    ['workflow', (value: ReturnType<typeof evidence>) => { value.run.path = '.github/workflows/ci.yml' }],
    ['workflow ID', (value: ReturnType<typeof evidence>) => { value.run.workflow_id = 999 }],
    ['event', (value: ReturnType<typeof evidence>) => { value.run.event = 'pull_request' }],
    ['configuration', (value: ReturnType<typeof evidence>) => { value.jobs[0].steps[1].name = value.jobs[0].steps[1].name.replace(configuration, 'c'.repeat(64)) }],
  ])('cannot use an incompatible %s as release evidence', (_name, change) => {
    const value = evidence()
    change(value)
    expect(evaluateCandidateVerification(identity, [value]).status).toBe('blocked')
  })

  it('waits for an in-progress run even if old successful attempt jobs are present', () => {
    const value = evidence()
    value.run.status = 'in_progress'
    expect(evaluateCandidateVerification(identity, [value]).status).toBe('blocked')
  })

  it('uses the failed task retry while preserving successful tasks from the original attempt', () => {
    const value = evidence()
    value.run.run_attempt = 2
    value.run.updated_at = '2026-10-30T03:15:00Z'
    value.jobs[2].conclusion = 'failure'
    value.jobs.push({ ...value.jobs[2], id: 100, run_attempt: 2, conclusion: 'success',
      created_at: '2026-10-30T03:00:00Z', ...timing('2026-10-30T03:00:00Z', '2026-10-30T03:10:00Z') })
    const result = evaluateCandidateVerification(identity, [value])
    expect(result.status).toBe('passed')
    expect(result.tasks[1].jobId).toBe(100)
    expect(result.tasks[0].jobId).toBe(2)
  })

  it('does not hide a later failed retry behind an older successful attempt', () => {
    const value = evidence()
    value.run.run_attempt = 2
    value.run.updated_at = '2026-10-30T03:15:00Z'
    value.jobs.push({ ...value.jobs[2], id: 100, run_attempt: 2, conclusion: 'failure',
      created_at: '2026-10-30T03:00:00Z', ...timing('2026-10-30T03:00:00Z', '2026-10-30T03:10:00Z') })
    expect(evaluateCandidateVerification(identity, [value]).tasks[1].status).toBe('blocked')
  })

  it('blocks a later failed rerun of an earlier-created run after a successful independent retry', () => {
    const original = evidence()
    original.run.run_attempt = 2
    original.run.updated_at = '2026-10-30T03:15:00Z'
    original.jobs.push({ ...original.jobs[2], id: 100, run_attempt: 2, conclusion: 'failure',
      created_at: '2026-10-30T03:00:00Z', ...timing('2026-10-30T03:00:00Z', '2026-10-30T03:10:00Z') })

    const result = evaluateCandidateVerification(identity, [original, fastOnlyEvidence()])

    expect(result.status).toBe('blocked')
    expect(result.tasks[1]).toMatchObject({ status: 'blocked', runId: 1, jobId: 100 })
    expect(result.tasks.filter(task => task.status === 'blocked').map(task => task.id)).toEqual(['fast'])
  })

  it('combines a failed-task-only compatible run with other successful task evidence', () => {
    const first = evidence()
    first.jobs[2].conclusion = 'failure'
    const retry = fastOnlyEvidence()
    const result = evaluateCandidateVerification(identity, [retry, first])
    expect(result.status).toBe('passed')
    expect(result.tasks[1].runId).toBe(2)
    expect(result.tasks[0].runId).toBe(1)
  })

  it('does not hide a newer failed subset run behind an older complete success', () => {
    const first = evidence()
    const retry = fastOnlyEvidence()
    retry.jobs[1].conclusion = 'failure'
    expect(evaluateCandidateVerification(identity, [first, retry]).tasks[1].status).toBe('blocked')
  })

  it('accepts a later successful rerun after an independent failed subset run', () => {
    const original = evidence()
    original.run.run_attempt = 2
    original.run.updated_at = '2026-10-30T03:15:00Z'
    original.jobs.push({ ...original.jobs[2], id: 100, run_attempt: 2,
      created_at: '2026-10-30T03:00:00Z', ...timing('2026-10-30T03:00:00Z', '2026-10-30T03:10:00Z') })
    const subset = fastOnlyEvidence()
    subset.jobs[1].conclusion = 'failure'

    const result = evaluateCandidateVerification(identity, [subset, original])

    expect(result.status).toBe('passed')
    expect(result.tasks[1]).toMatchObject({ status: 'passed', runId: 1, jobId: 100 })
  })

  it('does not move an unchanged task forward when a different task is rerun', () => {
    const original = evidence()
    original.jobs[2].conclusion = 'failure'
    original.run.run_attempt = 2
    original.run.updated_at = '2026-10-30T03:15:00Z'
    original.jobs.push({ ...original.jobs[1], id: 100, run_attempt: 2, conclusion: 'failure',
      created_at: '2026-10-30T03:00:00Z', ...timing('2026-10-30T03:00:00Z', '2026-10-30T03:10:00Z') })

    const result = evaluateCandidateVerification(identity, [fastOnlyEvidence(), original])

    expect(result.tasks[0]).toMatchObject({ status: 'blocked', runId: 1, jobId: 100 })
    expect(result.tasks[1]).toMatchObject({ status: 'passed', runId: 2, jobId: 103 })
    expect(result.tasks.filter(task => task.status === 'blocked').map(task => task.id)).toEqual(['quality'])
  })

  it.each(['skipped', 'cancelled'])('blocks a later %s rerun after another run succeeded', conclusion => {
    const original = evidence()
    original.run.run_attempt = 2
    original.run.updated_at = '2026-10-30T03:15:00Z'
    original.jobs.push({ ...original.jobs[2], id: 100, run_attempt: 2, conclusion,
      created_at: '2026-10-30T03:00:00Z', ...timing('2026-10-30T03:00:00Z', '2026-10-30T03:10:00Z') })

    expect(evaluateCandidateVerification(identity, [original, fastOnlyEvidence()]).tasks[1])
      .toMatchObject({ status: 'blocked', runId: 1, jobId: 100 })
  })

  it.each(['queued', 'in_progress'])('blocks newer %s work with no completion timestamp', status => {
    const newer = fastOnlyEvidence()
    newer.run.status = status
    newer.jobs[1].status = status
    newer.jobs[1].started_at = status === 'queued' ? null : '2026-10-30T01:05:00Z'
    newer.jobs[1].completed_at = null

    expect(evaluateCandidateVerification(identity, [newer, evidence()]).tasks[1])
      .toMatchObject({ status: 'blocked', runId: 2, jobId: 103 })
  })

  it('blocks a newer manifest that requested a task without actually running it', () => {
    const newer = fastOnlyEvidence()
    newer.jobs = [newer.jobs[0]]

    expect(evaluateCandidateVerification(identity, [newer, evidence()]).tasks[1])
      .toMatchObject({ status: 'blocked', reason: 'Required candidate task was not run', runId: 2, jobId: null })
  })

  it('does not mark missing work as finished when its manifest completed before the run ended', () => {
    const original = evidence()
    original.run.updated_at = '2026-10-30T03:15:00Z'
    original.jobs = original.jobs.filter(job => !job.name.startsWith('candidate / fast /'))

    expect(evaluateCandidateVerification(identity, [original, fastOnlyEvidence()]).status).toBe('blocked')
  })

  it('does not date missing manifest evidence by its original run creation time', () => {
    const original = evidence()
    original.jobs = []

    expect(evaluateCandidateVerification(identity, [{ ...original, run: { ...original.run, updated_at: null } }, fastOnlyEvidence()]).tasks[1])
      .toMatchObject({ status: 'blocked', reason: 'Candidate task execution chronology is missing or invalid' })
  })

  it('recovers after an earlier run was canceled before its manifest started', () => {
    const canceled = evidence()
    canceled.jobs = []

    const result = evaluateCandidateVerification(identity, [laterEvidence(), {
      ...canceled, run: { ...canceled.run, conclusion: 'cancelled' },
    }])

    expect(result.status).toBe('passed')
    expect(result.tasks.every(task => task.runId === 2)).toBe(true)
  })

  it('blocks a newer run canceled before its manifest instead of reusing older success', () => {
    const canceled = laterEvidence()
    canceled.jobs = []

    const result = evaluateCandidateVerification(identity, [evidence(), {
      ...canceled, run: { ...canceled.run, conclusion: 'cancelled' },
    }])

    expect(result.status).toBe('blocked')
    expect(result.tasks.every(task => task.status === 'blocked' && task.runId === 2)).toBe(true)
  })

  it('does not bound an earlier-created canceled rerun by its original creation time', () => {
    const canceled = evidence()
    canceled.run.run_attempt = 2
    canceled.run.updated_at = '2026-10-30T03:15:00Z'
    canceled.jobs = []

    expect(evaluateCandidateVerification(identity, [laterEvidence(), canceled]).status).toBe('blocked')
  })

  it('rejects a run completion bound that predates trusted job metadata', () => {
    const canceled = evidence()
    canceled.jobs = [{ ...canceled.jobs[0], conclusion: 'cancelled', created_at: '2026-10-30T03:00:00Z',
      ...timing(null, null) }]

    expect(evaluateCandidateVerification(identity, [canceled, laterEvidence()]).status).toBe('blocked')
  })

  it('does not reuse task jobs from before a rerun manifest requested them again', () => {
    const value = evidence()
    value.run.run_attempt = 2
    value.run.updated_at = '2026-10-30T03:15:00Z'
    value.jobs.push({ ...value.jobs[0], id: 100, run_attempt: 2,
      created_at: '2026-10-30T03:00:00Z', ...timing('2026-10-30T03:00:00Z', '2026-10-30T03:01:00Z') })

    const result = evaluateCandidateVerification(identity, [fastOnlyEvidence(), value])

    expect(result.status).toBe('blocked')
    expect(result.tasks[1]).toMatchObject({ status: 'blocked', reason: 'Required candidate task was not run', runId: 1, jobId: null })
  })

  it.each([
    timing(null, '2026-10-30T01:10:00Z'),
    timing('invalid', '2026-10-30T01:10:00Z'),
    timing('2026-10-30T01:05:00Z', null),
    timing('2026-10-30T01:05:00Z', '2026-10-30T01:00:00Z'),
  ])('blocks reuse when task chronology is missing or invalid: %j', timestamps => {
    const newer = fastOnlyEvidence()
    Object.assign(newer.jobs[1], timestamps)

    expect(evaluateCandidateVerification(identity, [newer, evidence()]).tasks[1])
      .toMatchObject({ status: 'blocked', reason: 'Candidate task execution chronology is missing or invalid' })
  })

  it('blocks overlapping executions whose completion order cannot establish a newer attempt', () => {
    const original = evidence()
    original.run.updated_at = '2026-10-30T02:15:00Z'
    original.jobs[2].conclusion = 'failure'
    original.jobs[2].completed_at = '2026-10-30T02:00:00Z'

    const result = evaluateCandidateVerification(identity, [original, fastOnlyEvidence()])

    expect(result.status).toBe('blocked')
    expect(result.tasks[1].reason).toBe('Candidate task execution chronology is ambiguous')
  })

  it('rejects editable success JSON without GitHub workflow provenance', () => {
    expect(() => evaluateCandidateVerification(identity, [{ run: { status: 'passed', sha, configuration }, jobs: [] }]))
      .toThrow('Invalid GitHub evidence')
  })

  it('reads paginated compact JSON lines without requiring modern gh --slurp', () => {
    expect(parseGitHubJsonLines('{"id":1,"name":"first\\nstep"}\n{"id":2}\n')).toEqual([
      { id: 1, name: 'first\nstep' }, { id: 2 },
    ])
  })
})
