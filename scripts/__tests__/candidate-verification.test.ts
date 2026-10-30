import { describe, expect, it } from 'vitest'
import { evaluateCandidateVerification, parseGitHubJsonLines } from '../ci/candidate-verification'

const sha = 'a'.repeat(40)
const configuration = 'b'.repeat(64)
const tasks = ['quality', 'fast', 'slow', 'build', 'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit']
const identity = { repository: 'titanxxh/open-agricola', sha, configuration, workflowId: 100 }
const step = (name: string, conclusion = 'success') => ({ name, status: 'completed', conclusion })
const job = (name: string, id: number) => ({ id, run_id: 1, name, status: 'completed', conclusion: 'success', run_attempt: 1,
  html_url: `https://github.com/titanxxh/open-agricola/actions/runs/1/job/${id}`,
  steps: [step('Checkout candidate'), step('Install dependencies'), step('Verify candidate checkout'), step('Execute verification task'), step('Install browsers')],
})

function evidence() {
  return {
    run: { id: 1, workflow_id: 100, path: '.github/workflows/candidate-verification.yml', event: 'workflow_dispatch',
      head_sha: sha, repository: { full_name: 'titanxxh/open-agricola' }, status: 'completed',
      created_at: '2026-10-30T00:00:00Z', run_attempt: 1, html_url: 'https://github.com/titanxxh/open-agricola/actions/runs/1' },
    jobs: [
      { ...job('candidate-manifest', 1), steps: [step('Generate candidate manifest'), step(`Candidate manifest / ${sha} / ${configuration} / ${tasks.join(',')}`)] },
      ...tasks.map((task, index) => job(`candidate / ${task} / ${configuration}`, index + 2)),
    ],
  }
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
    value.jobs[2].conclusion = 'failure'
    value.jobs.push({ ...value.jobs[2], id: 100, run_attempt: 2, conclusion: 'success' })
    const result = evaluateCandidateVerification(identity, [value])
    expect(result.status).toBe('passed')
    expect(result.tasks[1].jobId).toBe(100)
    expect(result.tasks[0].jobId).toBe(2)
  })

  it('does not hide a later failed retry behind an older successful attempt', () => {
    const value = evidence()
    value.run.run_attempt = 2
    value.jobs.push({ ...value.jobs[2], id: 100, run_attempt: 2, conclusion: 'failure' })
    expect(evaluateCandidateVerification(identity, [value]).tasks[1].status).toBe('blocked')
  })

  it('combines a failed-task-only compatible run with other successful task evidence', () => {
    const first = evidence()
    first.jobs[2].conclusion = 'failure'
    const retry = evidence()
    retry.run.id = 2
    retry.run.created_at = '2026-10-30T01:00:00Z'
    retry.jobs = [retry.jobs[0], retry.jobs[2]]
    retry.jobs[0].steps[1].name = `Candidate manifest / ${sha} / ${configuration} / fast`
    for (const job of retry.jobs) { job.run_id = 2; job.id += 100 }
    const result = evaluateCandidateVerification(identity, [retry, first])
    expect(result.status).toBe('passed')
    expect(result.tasks[1].runId).toBe(2)
    expect(result.tasks[0].runId).toBe(1)
  })

  it('does not hide a newer failed subset run behind an older complete success', () => {
    const first = evidence()
    const retry = evidence()
    retry.run.id = 2
    retry.run.created_at = '2026-10-30T01:00:00Z'
    retry.jobs = [retry.jobs[0], retry.jobs[2]]
    retry.jobs[0].steps[1].name = `Candidate manifest / ${sha} / ${configuration} / fast`
    for (const job of retry.jobs) { job.run_id = 2; job.id += 100 }
    retry.jobs[1].conclusion = 'failure'
    expect(evaluateCandidateVerification(identity, [first, retry]).tasks[1].status).toBe('blocked')
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
