import type { WorkshopAbilityCandidateContract } from '../../../../shared/contract/workshop'
import type { GenerationProvenance, GenerationResult, GenerationUsage, WorkshopSandboxContract } from '../../../../shared/contract/workshop-generation'
import { sourceFingerprint } from '../../../../shared/projections/workshop-generation'
import { GENERATION_PROMPT_VERSION, generationSystemPrompt } from './prompt'
import { extractGenerationOutput, type GenerationOutput, type GenerationRequest } from './request'
import { REFERENCE_LIMITS, REFERENCE_TOOLS, REFERENCE_TOOL_VERSION, type ReferenceSession } from './references'
import { ModelTurnError, UNKNOWN_USAGE, type ToolCall, type ToolTransport, type WireMessage } from './protocol'

export const ATTEMPT_ALLOWANCE = Object.freeze({ modelRequests: 8, referenceCalls: 24, activeMs: 5 * 60 * 1000 })
export const GENERATION_CONTEXT_BYTES = 192 * 1024
export type CodeValidation = { valid: boolean; errors: string[]; sourceFingerprint: string; sandboxContractId: string; cardJson?: Record<string, unknown> }
export type AttemptPorts = {
  model: ToolTransport
  loadContract(signal: AbortSignal): Promise<WorkshopSandboxContract>
  openReferences(signal: AbortSignal): Promise<Pick<ReferenceSession, 'commit' | 'reads' | 'execute'>>
  validate(source: string, cardId: string, contractId: string, signal: AbortSignal): Promise<CodeValidation>
  now?: () => number
}
type Stage = 'initializing' | 'model' | 'references' | 'validation'
export type AttemptSnapshot = {
  attemptId: string
  status: 'ready' | 'running' | 'paused' | 'completed' | 'cancelled'
  stage: Stage
  reason?: string
  retry?: Stage
  needsAllowance: boolean
  modelRequests: number
  referenceCalls: number
  repairs: number
  activeMs: number
  allowance: { modelRequests: number; referenceCalls: number; activeMs: number }
  usage: GenerationUsage
  referenceCommit?: string
  sandboxContractId?: string
  result?: GenerationResult
  candidate?: WorkshopAbilityCandidateContract
}
export type RequestAccounting = {
  sequence: number; inputBytes: number; startedAt: number; elapsedMs: number
  usage: GenerationUsage; finishReason: string; returnedModel?: string; requestId?: string
}

export class GenerationStopError extends Error {}

/** Owns the page-memory checkpoint, protocol, budgets and complete source. UI
 * only observes snapshots; a refresh deliberately cannot reconstruct this class.
 */
export class GenerationAttempt {
  readonly request: GenerationRequest
  private readonly ports: AttemptPorts
  private readonly observe: (snapshot: AttemptSnapshot) => void
  private readonly onText: (text: string) => void
  private readonly clock: () => number
  private readonly allowance = { ...ATTEMPT_ALLOWANCE }
  private readonly messages: WireMessage[] = []
  private readonly accounting: RequestAccounting[] = []
  private status: AttemptSnapshot['status'] = 'ready'
  private stage: Stage = 'initializing'
  private reason?: string
  private retry?: Stage
  private needsAllowance = false
  private references?: Awaited<ReturnType<AttemptPorts['openReferences']>>
  private contract?: WorkshopSandboxContract
  private pendingCalls?: { calls: ToolCall[]; results: Map<string, string>; started: Set<string> }
  private pendingOutput?: GenerationOutput
  private lastCandidate?: WorkshopAbilityCandidateContract
  private result?: GenerationResult
  private referenceCalls = 0
  private repairs = 0
  private activeMs = 0
  private startedAt?: number
  private controller?: AbortController
  private running?: Promise<AttemptSnapshot>

  constructor(request: GenerationRequest, ports: AttemptPorts, options: {
    onProgress?: (snapshot: AttemptSnapshot) => void
    onText?: (text: string) => void
  } = {}) {
    this.request = request
    this.ports = ports
    this.clock = ports.now ?? Date.now
    this.observe = options.onProgress ?? (() => {})
    this.onText = options.onText ?? (() => {})
  }

  snapshot(): AttemptSnapshot {
    const usage = this.accounting.length ? this.accounting.reduce<GenerationUsage>((sum, entry) => ({
      inputTokens: sum.inputTokens === null || entry.usage.inputTokens === null ? null : sum.inputTokens + entry.usage.inputTokens,
      outputTokens: sum.outputTokens === null || entry.usage.outputTokens === null ? null : sum.outputTokens + entry.usage.outputTokens,
      cachedInputTokens: sum.cachedInputTokens === null || entry.usage.cachedInputTokens === null ? null : sum.cachedInputTokens + entry.usage.cachedInputTokens,
      reasoningTokens: sum.reasoningTokens === null || entry.usage.reasoningTokens === null ? null : sum.reasoningTokens + entry.usage.reasoningTokens,
    }), { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0 }) : { ...UNKNOWN_USAGE }
    return structuredClone({
      attemptId: this.request.attemptId, status: this.status, stage: this.stage, reason: this.reason, retry: this.retry,
      needsAllowance: this.needsAllowance, modelRequests: this.accounting.length, referenceCalls: this.referenceCalls,
      repairs: this.repairs, activeMs: this.activeMs + (this.startedAt === undefined ? 0 : Math.max(0, this.clock() - this.startedAt)),
      allowance: this.allowance, usage, referenceCommit: this.references?.commit, sandboxContractId: this.contract?.id,
      result: this.result, candidate: this.lastCandidate,
    })
  }

  /** Compact request facts only; never exposes wire messages/reasoning/signatures. */
  requestAccounting(): RequestAccounting[] { return structuredClone(this.accounting) }

  start(): Promise<AttemptSnapshot> {
    if (this.status !== 'ready') return this.running ?? Promise.resolve(this.snapshot())
    return this.launch()
  }

  resume(options: { extendAllowance?: boolean; retry?: boolean } = {}): Promise<AttemptSnapshot> {
    if (this.status !== 'paused') return this.running ?? Promise.resolve(this.snapshot())
    // A timed-out or failed POST is never silently replayed by a generic continue.
    if (this.retry && !options.retry) return Promise.resolve(this.snapshot())
    if (this.needsAllowance && !options.extendAllowance) return Promise.resolve(this.snapshot())
    if (options.extendAllowance) {
      this.allowance.modelRequests += ATTEMPT_ALLOWANCE.modelRequests
      this.allowance.referenceCalls += ATTEMPT_ALLOWANCE.referenceCalls
      this.allowance.activeMs += ATTEMPT_ALLOWANCE.activeMs
    }
    return this.launch()
  }

  cancel(): void {
    if (this.status === 'completed' || this.status === 'cancelled') return
    this.status = 'cancelled'
    this.controller?.abort()
    this.finish('interrupted', 'Generation was cancelled. Partial output is not a candidate.')
  }

  private publish(): void { this.observe(this.snapshot()) }
  private provenance(): GenerationProvenance {
    const snapshot = this.snapshot()
    return {
      attemptId: this.request.attemptId, inputFingerprint: this.request.inputFingerprint,
      ...(this.lastCandidate ? { sourceFingerprint: sourceFingerprint(this.lastCandidate.sourceCode) } : {}),
      referenceCommit: this.references?.commit, sandboxContractId: this.contract?.id,
      promptVersion: GENERATION_PROMPT_VERSION, toolVersion: REFERENCE_TOOL_VERSION,
      ...this.ports.model.target, returnedModel: this.accounting.at(-1)?.returnedModel,
      modelRequests: snapshot.modelRequests, referenceCalls: snapshot.referenceCalls, repairs: snapshot.repairs,
      elapsedMs: snapshot.activeMs, usage: snapshot.usage, references: this.references?.reads ?? [],
    }
  }

  private finish(kind: GenerationResult['kind'], message: string): void {
    if (this.status !== 'cancelled') this.status = 'completed'
    if (this.lastCandidate) this.lastCandidate = { ...this.lastCandidate, provenance: this.provenance() }
    const failedCandidate = this.lastCandidate && !this.lastCandidate.validation.valid ? this.lastCandidate : undefined
    this.result = {
      kind: failedCandidate ? 'failed-source' : kind, attemptId: this.request.attemptId, createdAt: this.clock(), message,
      provenance: this.provenance(),
      ...(this.lastCandidate ? { candidateId: this.lastCandidate.id, sourceFingerprint: sourceFingerprint(this.lastCandidate.sourceCode) } : {}),
      ...(failedCandidate ? { failedCandidate } : {}),
    }
    this.publish()
  }

  private pause(reason: string, retry?: Stage, needsAllowance = false): void {
    this.status = 'paused'; this.reason = reason; this.retry = retry; this.needsAllowance = needsAllowance
    this.publish()
  }

  private launch(): Promise<AttemptSnapshot> {
    if (this.running) return this.running
    this.status = 'running'; this.reason = undefined; this.retry = undefined; this.needsAllowance = false
    this.startedAt = this.clock()
    this.controller = new AbortController()
    const signal = this.controller.signal
    const timer = setTimeout(() => this.controller?.abort(), Math.max(1, this.allowance.activeMs - this.activeMs))
    this.running = this.drive(signal).catch(error => {
      if (this.status === 'cancelled') return
      if (error instanceof GenerationStopError) this.finish('failure', error.message)
      else if (signal.aborted) this.pause('The active time allowance was reached. Continue explicitly; retrying a model request may incur an additional charge.', this.stage, true)
      else this.pause(error instanceof Error ? error.message : 'Generation could not continue.', this.stage)
    }).finally(() => {
      clearTimeout(timer)
      this.activeMs += Math.max(0, this.clock() - this.startedAt!)
      this.startedAt = undefined; this.running = undefined
      this.publish()
    }).then(() => this.snapshot())
    return this.running
  }

  private async drive(signal: AbortSignal): Promise<void> {
    this.publish()
    if (!this.contract) this.contract = await this.ports.loadContract(signal)
    signal.throwIfAborted()
    if (!this.references) this.references = await this.ports.openReferences(signal)
    signal.throwIfAborted()
    if (!this.messages.length) this.messages.push(
      { role: 'system', content: generationSystemPrompt(this.contract, this.references.commit) },
      { role: 'user', content: JSON.stringify(this.request.input) },
    )
    while (this.status === 'running') {
      signal.throwIfAborted()
      if (this.snapshot().activeMs >= this.allowance.activeMs) { this.pause('The active time allowance was reached.', undefined, true); return }
      if (this.pendingCalls) {
        this.stage = 'references'; this.publish()
        const pending = this.pendingCalls
        const unstarted = pending.calls.filter(call => !pending.started.has(call.id)).length
        if (this.referenceCalls + unstarted > this.allowance.referenceCalls) { this.pause('The reference-call allowance was reached before this tool group.', undefined, true); return }
        const remaining = pending.calls.filter(call => !pending.results.has(call.id))
        let next = 0
        let failure: unknown
        await Promise.all(Array.from({ length: Math.min(REFERENCE_LIMITS.concurrency, remaining.length) }, async () => {
          while (!failure && next < remaining.length) {
            const call = remaining[next++]
            if (!pending.started.has(call.id)) { this.referenceCalls += 1; pending.started.add(call.id); this.publish() }
            try { pending.results.set(call.id, await this.references!.execute(call, signal)) } catch (error) { failure = error }
          }
        }))
        if (failure) throw failure
        signal.throwIfAborted()
        this.messages.push(...pending.calls.map(call => ({ role: 'tool' as const, tool_call_id: call.id, content: pending.results.get(call.id)! })))
        this.pendingCalls = undefined
      }
      if (this.pendingOutput?.kind === 'source') {
        this.stage = 'validation'; this.publish()
        const output = this.pendingOutput
        const fingerprint = sourceFingerprint(output.source)
        const validation = await this.ports.validate(output.source, this.request.input.card.id, this.contract.id, signal)
        signal.throwIfAborted()
        if (validation.sourceFingerprint !== fingerprint || validation.sandboxContractId !== this.contract.id) throw new GenerationStopError('The validation result belongs to different source or a different sandbox deployment. Start a new attempt.')
        const card = this.request.input.card
        if (validation.valid && (validation.cardJson?.id !== card.id || validation.cardJson?.card_type !== card.type || validation.cardJson?.name !== card.name)) {
          validation.valid = false
          validation.errors = [...validation.errors, 'CARD_DEF id, card type and name must match the immutable request identity.']
        }
        this.lastCandidate = {
          id: `${this.request.attemptId}:${fingerprint.slice(0, 16)}`, kind: 'ability', prompt: this.request.input.intent.message,
          createdAt: this.clock(), sourceCode: output.source, cardJson: validation.cardJson ?? {},
          sourceFingerprint: fingerprint, inputFingerprint: this.request.inputFingerprint,
          provider: this.ports.model.target.provider, model: this.ports.model.target.model,
          validation: { ...validation },
        }
        this.pendingOutput = undefined
        if (validation.valid) { this.finish('candidate', output.message); return }
        if (this.repairs >= 2) { this.finish('failed-source', 'The complete source still failed code validation after two repairs. It is retained for editing and cannot be adopted.'); return }
        this.repairs += 1
        this.messages.push({ role: 'user', content: `Static validation of source ${fingerprint} failed:\n${validation.errors.join('\n')}\nReturn the entire corrected source. Preserve all requested rules and identity. Do not invent missing capabilities.` })
      }
      if (this.accounting.length >= this.allowance.modelRequests) { this.pause('The model-request allowance was reached.', undefined, true); return }
      const inputBytes = new TextEncoder().encode(JSON.stringify({ messages: this.messages, tools: REFERENCE_TOOLS })).length
      if (inputBytes > GENERATION_CONTEXT_BYTES) throw new GenerationStopError('The reference and protocol context reached its fixed size limit. Start a new attempt with a narrower request; protocol fields were not truncated.')
      this.stage = 'model'
      const record: RequestAccounting = { sequence: this.accounting.length + 1, inputBytes, startedAt: this.clock(), elapsedMs: 0, usage: { ...UNKNOWN_USAGE }, finishReason: 'unknown' }
      this.accounting.push(record); this.publish()
      try {
        const turn = await this.ports.model.complete(this.messages, REFERENCE_TOOLS, signal, text => {
          if (!signal.aborted && this.status === 'running') this.onText(text)
        })
        record.usage = turn.usage; record.finishReason = turn.finishReason
        record.returnedModel = turn.returnedModel; record.requestId = turn.requestId
        signal.throwIfAborted()
        this.messages.push(turn.message)
        if (turn.calls.length) this.pendingCalls = { calls: turn.calls, results: new Map(), started: new Set() }
        else {
          let output: GenerationOutput
          try { output = extractGenerationOutput(turn.text) } catch (error) { throw new GenerationStopError(error instanceof Error ? error.message : 'Invalid final response.') }
          if (output.kind !== 'source') { this.finish(output.kind, output.message); return }
          const fingerprint = sourceFingerprint(output.source)
          this.lastCandidate = {
            id: `${this.request.attemptId}:${fingerprint.slice(0, 16)}`, kind: 'ability', prompt: this.request.input.intent.message,
            createdAt: this.clock(), sourceCode: output.source, cardJson: {}, sourceFingerprint: fingerprint, inputFingerprint: this.request.inputFingerprint,
            provider: this.ports.model.target.provider, model: this.ports.model.target.model,
            validation: { valid: false, errors: ['Code validation has not completed.'], sourceFingerprint: fingerprint, sandboxContractId: this.contract.id },
          }
          this.pendingOutput = output
        }
      } catch (error) {
        if (error instanceof ModelTurnError) { record.usage = error.usage; record.finishReason = error.kind }
        throw error
      } finally { record.elapsedMs = Math.max(0, this.clock() - record.startedAt) }
    }
  }
}
