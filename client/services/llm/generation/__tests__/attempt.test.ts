import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkshopDraftContract } from '../../../../../shared/contract/workshop'
import type { WorkshopSandboxContract } from '../../../../../shared/contract/workshop-generation'
import { abilityArtifactFingerprint, isAbilityCandidateReady, sourceFingerprint } from '../../../../../shared/projections/workshop-generation'
import { GenerationAttempt, type AttemptPorts } from '../attempt'
import { buildGenerationRequest } from '../request'
import { ModelTurnError, type ModelTurn, type ToolCall, type WireMessage } from '../protocol'

const draft = {
  cardId: 'CUSTOM_Test', cardType: 'minor', name: 'Test', description: 'Gain food',
  cardJson: { id: 'CUSTOM_Test', card_type: 'minor', name: 'Test' },
  effectCode: 'adopted source', artUrl: null, generation: {},
} satisfies WorkshopDraftContract
const request = () => buildGenerationRequest({ workspaceId: 'workspace', baseRevision: 1, draft, intent: { kind: 'generate', message: 'gain food' }, attemptId: 'attempt', now: 1 })
const contract: WorkshopSandboxContract = { format: 2, id: 'sandbox-v1:' + 'a'.repeat(64), runtime: 'server-isolated-vm', limits: { memoryLimitMb: 8, executionTimeoutMs: 100 }, effects: [], listeners: { actions: [], phases: [], scopes: [], players: { actor: 'player', owner: 'ownerPlayer', effectRecipient: 'effectPlayer' } }, actions: [] }
const source = 'const CARD_ID="CUSTOM_Test"; const CARD_DEF={}; const CARD_IMPL={}'
const tests = "test('gain', () => expect(1).to.equal(1))"
const call = (name: string, args: unknown = {}, id = name): ToolCall => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })
const write = (code = source, testCode = tests, id = 'write') => call('write_artifacts', { source: code, tests: testCode }, id)
const run = (id = 'run') => call('run_tests', {}, id)
const read = (id = 'read') => call('search_references', { query: 'food' }, id)
const turn = (calls: ToolCall[] = [], text = ''): ModelTurn => ({
  calls, text, message: { role: 'assistant', content: text, ...(calls.length ? { tool_calls: calls, reasoning_content: 'opaque', extra_content: { signature: 'private-signature' } } : {}) },
  finishReason: calls.length ? 'tool_calls' : 'stop', returnedModel: 'actual-model',
  usage: { inputTokens: 2, outputTokens: 3, cachedInputTokens: null, reasoningTokens: null },
})
function ports(): AttemptPorts {
  return {
    model: { target: { provider: 'deepseek', endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-flash' }, complete: vi.fn(async () => turn()) },
    loadContract: vi.fn(async () => contract),
    openReferences: vi.fn(async () => ({ commit: 'b'.repeat(40), reads: [], execute: vi.fn(async () => 'reference') })),
    validate: vi.fn(async code => ({ valid: true, errors: [], sourceFingerprint: sourceFingerprint(code), sandboxContractId: contract.id, cardJson: draft.cardJson })),
    runTests: vi.fn<AttemptPorts['runTests']>(async () => ({ browserRuntimeId: 'browser-runtime-1', outcome: { kind: 'passed', count: 1 } })),
  }
}
function sequence(io: AttemptPorts, ...turns: ModelTurn[]) {
  let next = 0
  const history: WireMessage[][] = []
  io.model.complete = vi.fn<AttemptPorts['model']['complete']>(async messages => { history.push(structuredClone([...messages])); return turns[next++] ?? turn() })
  return history
}
afterEach(() => vi.useRealTimers())

describe('four-tool generation loop', () => {
  it('executes write/run/rewrite/run in model order and carries real failures into the next turn', async () => {
    const io = ports()
    const order: string[] = []
    io.validate = vi.fn(async code => {
      order.push(`validate:${code}`)
      return { valid: true, errors: [], sourceFingerprint: sourceFingerprint(code), sandboxContractId: contract.id, cardJson: draft.cardJson }
    })
    io.runTests = vi.fn<AttemptPorts['runTests']>(async (code, testCode) => {
      order.push(`test:${code}:${testCode}`)
      return { browserRuntimeId: 'browser-runtime-1', outcome: code === source
        ? { kind: 'failed', failures: [{ name: 'gain', error: 'expected 2, got 1' }] }
        : { kind: 'passed', count: 2 } }
    })
    const history = sequence(io, turn([write(), run()]), turn([write('fixed source', 'fixed tests', 'rewrite'), run('rerun')]), turn([], 'Ready for review'))
    const final = await new GenerationAttempt(request(), io).start()
    expect(order).toEqual([`validate:${source}`, `test:${source}:${tests}`, 'validate:fixed source', 'test:fixed source:fixed tests'])
    expect(JSON.parse(String(history[1].at(-1)?.content))).toMatchObject({ outcome: { kind: 'failed', failures: [{ name: 'gain', error: 'expected 2, got 1' }] } })
    expect(history[1].slice(-3).map(message => message.role)).toEqual(['assistant', 'tool', 'tool'])
    expect(history[1].at(-3)).toMatchObject({ reasoning_content: 'opaque', extra_content: { signature: 'private-signature' }, tool_calls: [{ id: 'write' }, { id: 'run' }] })
    expect(history[1].slice(-2).map(message => message.tool_call_id)).toEqual(['write', 'run'])
    expect(final).toMatchObject({ status: 'completed', modelRequests: 3, result: { kind: 'candidate', message: 'Ready for review' }, candidate: { sourceCode: 'fixed source', testing: { code: 'fixed tests', lastRun: { artifactFingerprint: abilityArtifactFingerprint('fixed source', 'fixed tests'), browserRuntimeId: 'browser-runtime-1', outcome: { kind: 'passed', count: 2 } } } }, usage: { inputTokens: 6, outputTokens: 9 } })
    expect(final.candidate && isAbilityCandidateReady(final.candidate)).toBe(true)
    expect(JSON.stringify(final)).not.toContain('opaque')
    expect(JSON.stringify(final)).not.toContain('private-signature')
  })

  it('lets the model make more than two repairs and skips UT after source validation fails', async () => {
    const io = ports()
    io.validate = vi.fn(async code => ({ valid: code === 'fixed', errors: code === 'fixed' ? [] : ['invalid hook'], sourceFingerprint: sourceFingerprint(code), sandboxContractId: contract.id, cardJson: draft.cardJson }))
    const history = sequence(io, ...[0, 1, 2, 3].map(index => turn([write(`broken ${index}`, tests, `write-${index}`), run(`run-${index}`)])), turn([write('fixed'), run()]), turn())
    const final = await new GenerationAttempt(request(), io).start()
    expect(io.validate).toHaveBeenCalledTimes(5)
    expect(io.runTests).toHaveBeenCalledExactlyOnceWith('fixed', tests, expect.any(AbortSignal))
    expect(final).toMatchObject({ modelRequests: 6, result: { kind: 'candidate' } })
    expect(history.at(-1)?.filter(message => message.role === 'user')).toHaveLength(1)
  })

  it.each(['', 'A question about timing', '```typescript\nconst CARD_IMPL={}\n```', '{"kind":"capability-gap","message":"No hook"}'])('keeps a final answer without manufacturing artifacts: %j', async text => {
    const io = ports()
    sequence(io, turn([], text))
    const final = await new GenerationAttempt(request(), io).start()
    expect(final).toMatchObject({ status: 'completed', result: { kind: 'answer', message: text } })
    expect(final.candidate).toBeUndefined()
    expect(io.validate).not.toHaveBeenCalled()
    expect(io.runTests).not.toHaveBeenCalled()
  })

  it('accepts empty final text after tools write and test the artifacts', async () => {
    const io = ports()
    sequence(io, turn([write(), run()]), turn())
    expect(await new GenerationAttempt(request(), io).start()).toMatchObject({ result: { kind: 'candidate', message: '' }, candidate: { sourceCode: source } })
  })

  it('invalidates a passed report when only the tests are rewritten', async () => {
    const io = ports()
    sequence(io, turn([write(), run(), write(source, 'changed test', 'change-tests')]), turn())
    const final = await new GenerationAttempt(request(), io).start()
    expect(final).toMatchObject({ result: { kind: 'failed-source' }, candidate: { sourceCode: source, validation: { valid: false }, testing: { code: 'changed test' } } })
    expect(final.candidate?.testing?.lastRun).toBeUndefined()
  })

  it('preserves static success with a failing UT as a result that cannot be adopted', async () => {
    const io = ports()
    io.runTests = vi.fn<AttemptPorts['runTests']>(async () => ({ browserRuntimeId: 'browser-runtime-1', outcome: { kind: 'error', message: 'No tests were registered.' } }))
    sequence(io, turn([write(source, ''), run()]), turn([], 'Tests need work'))
    const final = await new GenerationAttempt(request(), io).start()
    expect(final).toMatchObject({ result: { kind: 'failed-source', failedCandidate: { validation: { valid: true } } }, candidate: { testing: { lastRun: { outcome: { kind: 'error' } } } } })
    expect(final.candidate && isAbilityCandidateReady(final.candidate)).toBe(false)
  })

  it('returns tool argument and execution errors to the model without a fabricated repair request', async () => {
    const io = ports()
    io.runTests = vi.fn<AttemptPorts['runTests']>(async () => { throw new Error('Worker unavailable') })
    const invalid: ToolCall = { id: 'invalid', type: 'function', function: { name: 'write_artifacts', arguments: '{bad' } }
    const history = sequence(io, turn([run('missing'), invalid, call('unknown'), write(), run()]), turn())
    const final = await new GenerationAttempt(request(), io).start()
    const results = history[1].filter(message => message.role === 'tool').map(message => JSON.parse(String(message.content)))
    expect(results).toMatchObject([{ error: expect.stringContaining('first') }, { error: expect.stringContaining('JSON') }, { error: 'Unknown tool: unknown' }, { tested: false }, { error: 'Worker unavailable' }])
    expect(final).toMatchObject({ status: 'completed', result: { kind: 'failed-source' } })
  })

  it.each(['source', 'sandbox'])('rejects validation belonging to a different %s', async mismatch => {
    const io = ports()
    io.validate = vi.fn(async code => ({ valid: true, errors: [], sourceFingerprint: mismatch === 'source' ? 'other-source' : sourceFingerprint(code), sandboxContractId: mismatch === 'sandbox' ? 'other-contract' : contract.id, cardJson: draft.cardJson }))
    sequence(io, turn([write(), run()]))
    expect(await new GenerationAttempt(request(), io).start()).toMatchObject({ result: { kind: 'failure', message: expect.stringContaining('different') } })
    expect(io.runTests).not.toHaveBeenCalled()
  })

  it('rejects changing immutable card identity before browser execution', async () => {
    const io = ports()
    io.validate = vi.fn(async code => ({ valid: true, errors: [], sourceFingerprint: sourceFingerprint(code), sandboxContractId: contract.id, cardJson: { ...draft.cardJson, id: 'CUSTOM_Other' } }))
    sequence(io, turn([write(), run()]), turn())
    expect(await new GenerationAttempt(request(), io).start()).toMatchObject({ candidate: { validation: { valid: false, errors: [expect.stringContaining('immutable')] } }, result: { kind: 'failed-source' } })
    expect(io.runTests).not.toHaveBeenCalled()
  })

  it('continues beyond eight model turns with tools and preserves written artifacts', async () => {
    const io = ports()
    let count = 0
    io.model.complete = vi.fn<AttemptPorts['model']['complete']>(async (_messages, tools) => {
      expect(tools.map(tool => tool.function.name)).toEqual(['search_references', 'read_reference', 'write_artifacts', 'run_tests'])
      count += 1
      return count < 8 ? turn([read(`read-${count}`)]) : count === 8 ? turn([write(), run()]) : turn()
    })
    const attempt = new GenerationAttempt(request(), io)
    expect(await attempt.start()).toMatchObject({ status: 'completed', modelRequests: 9, candidate: { validation: { valid: true }, testing: { lastRun: { outcome: { kind: 'passed' } } } }, result: { kind: 'candidate' } })
    expect(io.openReferences).toHaveBeenCalledTimes(1)
  })

  it('executes more than 24 reference calls serially without an independent research allowance', async () => {
    const io = ports()
    let active = 0
    let maximum = 0
    const execute = vi.fn(async () => { active += 1; maximum = Math.max(maximum, active); await Promise.resolve(); active -= 1; return 'reference' })
    io.openReferences = vi.fn(async () => ({ commit: 'b'.repeat(40), reads: [], execute }))
    sequence(io, turn(Array.from({ length: 25 }, (_, i) => read(`read-${i}`))), turn())
    expect(await new GenerationAttempt(request(), io).start()).toMatchObject({ status: 'completed', referenceCalls: 25, result: { kind: 'answer' } })
    expect(execute).toHaveBeenCalledTimes(25)
    expect(maximum).toBe(1)
  })

  it('requires explicit retry after a failed POST and preserves unknown usage', async () => {
    const io = ports()
    io.model.complete = vi.fn<AttemptPorts['model']['complete']>().mockRejectedValueOnce(new ModelTurnError('network', 'connection lost')).mockResolvedValueOnce(turn())
    const attempt = new GenerationAttempt(request(), io)
    expect(await attempt.start()).toMatchObject({ status: 'paused', retry: 'model', modelRequests: 1 })
    await attempt.resume()
    expect(io.model.complete).toHaveBeenCalledTimes(1)
    expect(await attempt.resume({ retry: true })).toMatchObject({ status: 'completed', modelRequests: 2, usage: { inputTokens: null, outputTokens: null } })
  })

  it('does not count a model request stopped before POST', async () => {
    const io = ports()
    io.model.complete = vi.fn<AttemptPorts['model']['complete']>(async () => { throw new ModelTurnError('preflight', 'Request cancelled before POST') })
    const attempt = new GenerationAttempt(request(), io)
    expect(await attempt.start()).toMatchObject({ status: 'paused', modelRequests: 0, retry: 'model' })
    expect(attempt.requestAccounting()).toEqual([])
  })

  it('retains written artifacts after cancellation and ignores a late test pass', async () => {
    const io = ports()
    let finishTests: (value: Awaited<ReturnType<AttemptPorts['runTests']>>) => void = () => { throw new Error('Tests have not started') }
    let testingStarted: () => void = () => {}
    const started = new Promise<void>(resolve => { testingStarted = resolve })
    io.runTests = vi.fn<AttemptPorts['runTests']>((_source, _tests, signal) => new Promise(resolve => {
      expect(signal.aborted).toBe(false)
      finishTests = resolve
      testingStarted()
    }))
    sequence(io, turn([write(), run()]), turn())
    const attempt = new GenerationAttempt(request(), io)
    const pending = attempt.start()
    await started
    attempt.cancel()
    finishTests({ browserRuntimeId: 'browser-runtime-1', outcome: { kind: 'passed', count: 1 } })
    const final = await pending
    expect(final).toMatchObject({ status: 'cancelled', result: { kind: 'interrupted' }, candidate: { sourceCode: source } })
    expect(final.candidate?.testing?.lastRun).toBeUndefined()
    expect(io.model.complete).toHaveBeenCalledTimes(1)
  })

  it('keeps a model request active beyond five minutes until it completes', async () => {
    vi.useFakeTimers()
    const io = ports()
    let finish: (result: ModelTurn) => void = () => { throw new Error('Request has not started') }
    io.model.complete = vi.fn<AttemptPorts['model']['complete']>((_messages, _tools, signal) => new Promise(resolve => {
      expect(signal.aborted).toBe(false)
      finish = resolve
    }))
    const attempt = new GenerationAttempt(request(), io)
    const pending = attempt.start()
    await vi.advanceTimersByTimeAsync(300_001)
    expect(attempt.snapshot()).toMatchObject({ status: 'running', modelRequests: 1 })
    finish(turn())
    expect(await pending).toMatchObject({ status: 'completed', modelRequests: 1 })
  })


})
