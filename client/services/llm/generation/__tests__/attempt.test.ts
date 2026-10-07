import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkshopSandboxContract } from '../../../../../shared/contract/workshop-generation'
import { sourceFingerprint } from '../../../../../shared/projections/workshop-generation'
import { GenerationAttempt, type AttemptPorts } from '../attempt'
import { buildGenerationRequest, extractGenerationOutput } from '../request'
import { ModelTurnError, type ModelTurn, type ToolCall, type WireMessage } from '../protocol'

afterEach(() => vi.useRealTimers())

const draft = {
  cardId: 'CUSTOM_Test', cardType: 'minor' as const, name: 'Test', description: 'Gain food',
  cardJson: { id: 'CUSTOM_Test', card_type: 'minor', name: 'Test', cost: { wood: 2 } },
  effectCode: 'adopted source', artUrl: null, generation: {},
}
const request = () => buildGenerationRequest({ workspaceId: 'workspace', baseRevision: 1, draft, intent: { kind: 'generate', message: 'gain food' }, attemptId: 'attempt', now: 1 })
const contract: WorkshopSandboxContract = { format: 1, id: 'sandbox-v1:' + 'a'.repeat(64), runtime: 'server-isolated-vm', limits: { memoryLimitMb: 8, executionTimeoutMs: 100 }, effects: {}, listeners: { actions: [], phases: {}, scopes: [] }, actions: {}, helpers: '', semantics: [] }
const source = 'const CARD_DEF = { cardType: "minor", meta: {} }; const CARD_IMPL = {}'
const text = `\`\`\`typescript\n${source}\n\`\`\``
const call = (id: string): ToolCall => ({ id, type: 'function', function: { name: 'search_references', arguments: '{"query":"wood"}' } })
const turn = (calls: ToolCall[] = [], content = text): ModelTurn => ({
  calls, text: content, message: { role: 'assistant', content, ...(calls.length ? { tool_calls: calls, reasoning_content: 'opaque' } : {}) },
  finishReason: calls.length ? 'tool_calls' : 'stop', returnedModel: 'actual-model',
  usage: { inputTokens: 2, outputTokens: 3, cachedInputTokens: null, reasoningTokens: null },
})

function ports(): AttemptPorts {
  return {
    model: { target: { provider: 'deepseek', endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-v4-flash' }, complete: vi.fn(async () => turn()) },
    loadContract: vi.fn(async () => contract),
    openReferences: vi.fn(async () => ({ commit: 'b'.repeat(40), reads: [], execute: vi.fn(async () => 'reference') })),
    validate: vi.fn(async code => ({ valid: true, errors: [], sourceFingerprint: sourceFingerprint(code), sandboxContractId: contract.id, cardJson: draft.cardJson })),
  }
}

describe('immutable generation input', () => {
  it('uses selected B for follow-ups and the adopted draft when selection is absent', () => {
    const selected = { id: 'B', kind: 'ability' as const, sourceCode: 'selected B', cardJson: draft.cardJson, validation: { valid: true }, prompt: 'old', createdAt: 1 }
    const options = { workspaceId: 'w', baseRevision: 1, draft, intent: { kind: 'follow-up' as const, message: 'make it 2 wood' } }
    const snapshot = buildGenerationRequest({ ...options, selectedCandidate: selected })
    selected.sourceCode = 'edited afterward'
    expect(snapshot.input.source).toBe('selected B')
    expect(Object.isFrozen(snapshot.input.card.definition)).toBe(true)
    expect(buildGenerationRequest(options).input.source).toBe('adopted source')
  })

  it('binds repair to tested version B while C is selected', () => {
    const snapshot = buildGenerationRequest({ workspaceId: 'w', baseRevision: 1, draft,
      selectedCandidate: { id: 'C', kind: 'ability', sourceCode: 'selected C', cardJson: {}, validation: { valid: true }, createdAt: 1, prompt: 'other' },
      intent: { kind: 'repair', message: 'fix it', failure: { workspaceId: 'w', versionId: 'version-B', source: 'tested B', sourceFingerprint: sourceFingerprint('tested B'), errors: ['runtime error'] } },
    })
    expect(snapshot.input.source).toBe('tested B')
    expect(snapshot.sourceCandidate).toBeUndefined()
    expect(() => buildGenerationRequest({ workspaceId: 'w', baseRevision: 1, draft, intent: { kind: 'repair', message: 'fix', failure: { workspaceId: 'w', versionId: 'B', source: 'B', sourceFingerprint: 'mismatch', errors: [] } } })).toThrow('does not match')
  })

  it('does not extract a partial or ambiguous source as a completed result', () => {
    expect(() => extractGenerationOutput('```typescript\nconst CARD_IMPL = {}')).toThrow('Expected')
    expect(() => extractGenerationOutput(text + '\n' + text)).toThrow('multiple')
    expect(extractGenerationOutput('{"kind":"capability-gap","message":"Missing field construction extension"}').kind).toBe('capability-gap')
  })
})

describe('bounded browser generation attempt', () => {
  it('runs the frozen control with the same validator and exactly two repairs, without offering tools', async () => {
    const io = ports()
    io.validate = vi.fn(async code => ({ valid: false, errors: ['invalid hook'], sourceFingerprint: sourceFingerprint(code), sandboxContractId: contract.id }))
    const result = await new GenerationAttempt(request(), io, { recipe: {
      promptVersion: 'frozen-test', toolVersion: 'none', systemPrompt: () => 'unchanged full prompt', tools: [], modelRequests: 3,
    } }).start()
    expect(io.model.complete).toHaveBeenCalledTimes(3)
    for (const [messages, tools] of vi.mocked(io.model.complete).mock.calls) {
      expect(messages[0]).toEqual({ role: 'system', content: 'unchanged full prompt' })
      expect(tools).toEqual([])
    }
    expect(result).toMatchObject({ modelRequests: 3, repairs: 2, result: { kind: 'failed-source', provenance: { promptVersion: 'frozen-test', toolVersion: 'none' } } })
  })
  it('rejects unsolicited tool calls in a recipe which offered no tools', async () => {
    const io = ports()
    io.model.complete = vi.fn(async () => turn([call('unoffered')], ''))
    const result = await new GenerationAttempt(request(), io, { recipe: {
      promptVersion: 'control', toolVersion: 'none', systemPrompt: () => 'frozen', tools: [], modelRequests: 3,
    } }).start()
    expect(result).toMatchObject({ modelRequests: 1, referenceCalls: 0, result: { kind: 'failure' } })
    expect(io.validate).not.toHaveBeenCalled()
  })
  it('does not count an unissued model POST when reservation fails', async () => {
    const io = ports()
    io.model.complete = vi.fn(async () => { throw new ModelTurnError('preflight', 'Budget exhausted') })
    const attempt = new GenerationAttempt(request(), io)
    expect(await attempt.start()).toMatchObject({ status: 'paused', modelRequests: 0, retry: 'model' })
    expect(attempt.requestAccounting()).toEqual([])
  })
  it('preserves the assistant tool group and original IDs before asking for source', async () => {
    const io = ports()
    const history: WireMessage[][] = []
    io.model.complete = vi.fn(async messages => {
      history.push(structuredClone([...messages]))
      return history.length === 1 ? turn([call('first'), call('second')], '') : turn()
    })
    const attempt = new GenerationAttempt(request(), io)
    const result = await attempt.start()
    expect(history[1].slice(-4).map(message => message.role)).toEqual(['assistant', 'tool', 'tool', 'system'])
    expect(history[1].at(-4)).toMatchObject({ reasoning_content: 'opaque', tool_calls: [{ id: 'first' }, { id: 'second' }] })
    expect(history[1].slice(-3, -1).map(message => message.tool_call_id)).toEqual(['first', 'second'])
    expect(history[0].at(-1)?.content).toContain('model request 1 of 8; 7 model requests remain')
    expect(history[1].at(-1)?.content).toContain('model request 2 of 8; 6 model requests remain')
    expect(history[1].at(-1)?.content).toContain('Reference calls used: 2 of 24')
    expect(result).toMatchObject({ status: 'completed', modelRequests: 2, referenceCalls: 2, candidate: { sourceCode: source, validation: { valid: true } }, result: { kind: 'candidate' }, usage: { inputTokens: 4, outputTokens: 6 } })
    expect(JSON.stringify(result)).not.toContain('opaque')
  })

  it('uses at most two static repairs and retains the final failed complete source', async () => {
    const io = ports()
    io.validate = vi.fn(async code => ({ valid: false, errors: ['invalid hook'], sourceFingerprint: sourceFingerprint(code), sandboxContractId: contract.id }))
    const result = await new GenerationAttempt(request(), io).start()
    expect(io.model.complete).toHaveBeenCalledTimes(3)
    expect(io.validate).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({ repairs: 2, result: { kind: 'failed-source', failedCandidate: { sourceCode: source, validation: { valid: false } } } })
  })

  it('reserves the eighth response for source or an explicit research continuation, retaining the checkpoint', async () => {
    const io = ports()
    let requests = 0
    const notices: unknown[] = []
    io.model.complete = vi.fn(async (messages, tools, _signal, _onText, options) => {
      notices.push(messages.at(-1)?.content)
      requests++
      expect(tools.length).toBeGreaterThan(0)
      expect(options?.toolChoice).toBe(requests === 8 ? 'none' : 'auto')
      if (requests < 8) return turn([call(`call-${requests}`)], '')
      if (requests === 8) return turn([], '{"kind":"reference-continuation","message":"Need the remaining payment interface fields"}')
      return turn()
    })
    const attempt = new GenerationAttempt(request(), io)
    expect(await attempt.start()).toMatchObject({ status: 'paused', modelRequests: 8, needsAllowance: true, reason: 'Need the remaining payment interface fields' })
    expect(attempt.snapshot().result).toBeUndefined()
    expect(io.validate).not.toHaveBeenCalled()
    expect(await attempt.resume()).toMatchObject({ modelRequests: 8 })
    const final = await attempt.resume({ extendAllowance: true })
    expect(final).toMatchObject({ status: 'completed', modelRequests: 9, referenceCalls: 7, allowance: { modelRequests: 16, referenceCalls: 48 } })
    expect(notices.at(-1)).toContain('model request 9 of 16; 7 model requests remain')
    expect(notices.at(-1)).toContain('Reference calls used: 7 of 48')
    expect(io.openReferences).toHaveBeenCalledTimes(1)
  })

  it('validates complete source in the final response slot without requesting extra allowance', async () => {
    const io = ports()
    let requests = 0
    io.model.complete = vi.fn(async (_messages, _tools, _signal, _onText, options) => {
      if (++requests < 8) return turn([call(`read-${requests}`)], '')
      expect(options?.toolChoice).toBe('none')
      return turn()
    })
    expect(await new GenerationAttempt(request(), io).start()).toMatchObject({ status: 'completed', modelRequests: 8, referenceCalls: 7, candidate: { validation: { valid: true } } })
  })

  it('does not execute a provider tool call that violates the final response slot', async () => {
    const io = ports()
    let requests = 0
    io.model.complete = vi.fn(async () => turn([call(`read-${++requests}`)], ''))
    expect(await new GenerationAttempt(request(), io).start()).toMatchObject({ status: 'completed', modelRequests: 8, referenceCalls: 7, result: { kind: 'failure', message: expect.stringContaining('disabled') } })
  })

  it('starts no partial tool group across its budget and caps concurrent reads at three', async () => {
    const io = ports()
    let active = 0; let maximum = 0; let requests = 0
    io.openReferences = vi.fn(async () => ({ commit: 'b'.repeat(40), reads: [], execute: vi.fn(async () => {
      active++; maximum = Math.max(maximum, active)
      await new Promise(resolve => setTimeout(resolve, 1)); active--
      return 'read'
    }) }))
    io.model.complete = vi.fn(async () => ++requests === 1 ? turn(Array.from({ length: 25 }, (_, index) => call(`call-${index}`)), '') : turn())
    const attempt = new GenerationAttempt(request(), io)
    expect(await attempt.start()).toMatchObject({ status: 'paused', referenceCalls: 0 })
    expect(await attempt.resume({ extendAllowance: true })).toMatchObject({ status: 'completed', referenceCalls: 25 })
    expect(maximum).toBe(3)
  })

  it('requires an explicit retry after a failed POST and retains unknown usage', async () => {
    const io = ports()
    io.model.complete = vi.fn().mockRejectedValueOnce(new ModelTurnError('network', 'connection lost')).mockResolvedValueOnce(turn())
    const attempt = new GenerationAttempt(request(), io)
    expect(await attempt.start()).toMatchObject({ status: 'paused', retry: 'model', modelRequests: 1 })
    await attempt.resume({ extendAllowance: true })
    expect(io.model.complete).toHaveBeenCalledTimes(1)
    expect(await attempt.resume({ retry: true })).toMatchObject({ status: 'completed', modelRequests: 2, usage: { inputTokens: null, outputTokens: null } })
  })

  it('does not call a model repair for backend outages and preserves complete source while paused', async () => {
    const io = ports()
    const realValidate = io.validate
    io.validate = vi.fn().mockRejectedValueOnce(new Error('backend offline')).mockImplementation(realValidate)
    const attempt = new GenerationAttempt(request(), io)
    expect(await attempt.start()).toMatchObject({ status: 'paused', retry: 'validation', candidate: { sourceCode: source, validation: { valid: false } } })
    expect(await attempt.resume({ retry: true })).toMatchObject({ status: 'completed', modelRequests: 1, repairs: 0 })
  })

  it('times out an in-flight model request and requires explicit allowance plus retry', async () => {
    vi.useFakeTimers()
    const io = ports()
    io.model.complete = vi.fn().mockImplementationOnce((_messages, _tools, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new ModelTurnError('cancelled', 'timeout')), { once: true }))).mockResolvedValue(turn())
    const attempt = new GenerationAttempt(request(), io)
    const pending = attempt.start()
    await vi.advanceTimersByTimeAsync(300001)
    expect(await pending).toMatchObject({ status: 'paused', retry: 'model', needsAllowance: true, modelRequests: 1 })
    await attempt.resume({ extendAllowance: true })
    expect(io.model.complete).toHaveBeenCalledTimes(1)
    expect(await attempt.resume({ extendAllowance: true, retry: true })).toMatchObject({ status: 'completed', modelRequests: 2 })
  })

  it('returns capability gaps without pretending they passed code validation', async () => {
    const io = ports()
    io.model.complete = vi.fn(async () => turn([], '{"kind":"capability-gap","message":"Missing persistent construction hook"}'))
    expect(await new GenerationAttempt(request(), io).start()).toMatchObject({ result: { kind: 'capability-gap' } })
    expect(io.validate).not.toHaveBeenCalled()
  })
})
