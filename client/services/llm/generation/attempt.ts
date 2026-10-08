import type { WorkshopAbilityCandidateContract } from '../../../../shared/contract/workshop'
import type { GenerationProvenance, GenerationResult, GenerationUsage, WorkshopSandboxContract } from '../../../../shared/contract/workshop-generation'
import { sourceFingerprint } from '../../../../shared/projections/workshop-generation'
import { GENERATION_PROMPT_VERSION, generationSystemPrompt } from './prompt'
import { extractGenerationOutput, type GenerationOutput, type GenerationRequest } from './request'
import { REFERENCE_LIMITS, REFERENCE_TOOLS, REFERENCE_TOOL_VERSION, type ReferenceSession } from './references'
import { ModelTurnError, UNKNOWN_USAGE, type ToolCall, type ToolDefinition, type ToolTransport, type WireMessage } from './protocol'

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
  toolChoice?: 'auto' | 'none'
  usage: GenerationUsage; finishReason: string; returnedModel?: string; requestId?: string; responseWireBytes?: number
}

export class GenerationStopError extends Error {}

/** Dependency-injection seam for controlled comparisons. Product callers use
 * the default recipe; configuration and persisted drafts cannot select one. */
export type GenerationRecipe = {
  promptVersion: string
  toolVersion: string
  systemPrompt(contract: WorkshopSandboxContract, commit: string): string
  tools: readonly ToolDefinition[]
  modelRequests: number
}
const DEFAULT_RECIPE: GenerationRecipe = {
  promptVersion: GENERATION_PROMPT_VERSION, toolVersion: REFERENCE_TOOL_VERSION,
  systemPrompt: generationSystemPrompt, tools: REFERENCE_TOOLS, modelRequests: ATTEMPT_ALLOWANCE.modelRequests,
}

/** Owns the page-memory checkpoint, protocol, budgets and complete source. UI
 * only observes snapshots; a refresh deliberately cannot reconstruct this class.
 */
export class GenerationAttempt {
  readonly request: GenerationRequest
  private readonly ports: AttemptPorts
  private readonly observe: (snapshot: AttemptSnapshot) => void
  private readonly onText: (text: string) => void
  private readonly clock: () => number
  private readonly allowance: AttemptSnapshot['allowance'] = { ...ATTEMPT_ALLOWANCE }
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
  private readonly recipe: GenerationRecipe

  constructor(request: GenerationRequest, ports: AttemptPorts, options: {
    onProgress?: (snapshot: AttemptSnapshot) => void
    onText?: (text: string) => void
    recipe?: GenerationRecipe
  } = {}) {
    this.request = request
    this.ports = ports
    this.clock = ports.now ?? Date.now
    this.observe = options.onProgress ?? (() => {})
    this.onText = options.onText ?? (() => {})
    this.recipe = options.recipe ?? DEFAULT_RECIPE
    this.allowance.modelRequests = this.recipe.modelRequests
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
      promptVersion: this.recipe.promptVersion, toolVersion: this.recipe.toolVersion,
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
      { role: 'system', content: this.recipe.systemPrompt(this.contract, this.references.commit) },
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
      // Host execution context is separate from the immutable card request and
      // follows any complete tool group. Preserve every provider field and ID.
      // Keep the frozen control's source advice unchanged. The tool recipe
      // repeats its source-or-JSON contract on every request, not only the last.
      const finalResponseSlot = this.accounting.length + 1 === this.allowance.modelRequests
      const responseAdvice = this.recipe.tools.length
        ? 'If the required facts are established, return the final response now, leaving requests for validation repairs. Use exactly one fenced typescript block for complete source. For a capability gap or clarification, return one valid JSON object with kind "capability-gap" or "clarification" and a nonempty string message; escape line breaks inside message as \\n. Do not add source or prose outside that JSON object.'
        : 'If the required semantics and parameter shapes are established, return the complete final source now, leaving requests for validation repairs.'
      this.messages.push({ role: 'system', content: `[Browser execution status, not a change to the card requirements]\nThis is model request ${this.accounting.length + 1} of ${this.allowance.modelRequests}; ${this.allowance.modelRequests - this.accounting.length - 1} model requests remain after this response. Reference calls used: ${this.referenceCalls} of ${this.allowance.referenceCalls}. Static repairs still available: ${2 - this.repairs}, within the same request allowance. ${responseAdvice} Query further only for a specific unresolved fact; an exhausted allowance is not a sandbox capability gap.${finalResponseSlot && this.recipe.tools.length ? '\nThis is the final response slot of the current allowance. Reference calls are disabled for this response. Produce the complete source using established facts, or the supported clarification/capability-gap response if justified by the requirements and actual contract. If an essential reference fact is still unresolved, do not guess: return {"kind":"reference-continuation","message":"Describe the exact missing fact and reference to inspect"}. The browser will pause for explicit continuation with the same inputs and references.' : ''}` })
      const inputBytes = new TextEncoder().encode(JSON.stringify({ messages: this.messages, tools: this.recipe.tools })).length
      if (inputBytes > GENERATION_CONTEXT_BYTES) throw new GenerationStopError('The reference and protocol context reached its fixed size limit. Start a new attempt with a narrower request; protocol fields were not truncated.')
      this.stage = 'model'
      const record: RequestAccounting = { sequence: this.accounting.length + 1, inputBytes, startedAt: this.clock(), elapsedMs: 0, usage: { ...UNKNOWN_USAGE }, finishReason: 'unknown', ...(this.recipe.tools.length ? { toolChoice: finalResponseSlot ? 'none' as const : 'auto' as const } : {}) }
      this.accounting.push(record); this.publish()
      try {
        const turn = await this.ports.model.complete(this.messages, this.recipe.tools, signal, text => {
          if (!signal.aborted && this.status === 'running') this.onText(text)
        }, { toolChoice: finalResponseSlot ? 'none' : 'auto' })
        record.usage = turn.usage; record.finishReason = turn.finishReason
        record.returnedModel = turn.returnedModel; record.requestId = turn.requestId
        record.responseWireBytes = turn.responseWireBytes
        signal.throwIfAborted()
        if ((!this.recipe.tools.length || finalResponseSlot) && turn.calls.length) throw new GenerationStopError('The model returned tool calls when reference calls were disabled.')
        this.messages.push(turn.message)
        if (turn.calls.length) this.pendingCalls = { calls: turn.calls, results: new Map(), started: new Set() }
        else {
          let output: GenerationOutput
          try { output = extractGenerationOutput(turn.text) } catch (error) { throw new GenerationStopError(error instanceof Error ? error.message : 'Invalid final response.') }
          if (output.kind === 'reference-continuation') {
            if (!finalResponseSlot || !this.recipe.tools.length) throw new GenerationStopError('The model requested a reference continuation outside the final response slot.')
            this.pause(output.message, undefined, true)
            return
          }
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
        if (error instanceof ModelTurnError && error.kind === 'preflight') this.accounting.pop()
        if (error instanceof ModelTurnError) {
          record.usage = error.usage; record.finishReason = error.kind
          record.returnedModel = error.returnedModel; record.requestId = error.requestId; record.responseWireBytes = error.responseWireBytes
        }
        throw error
      } finally { record.elapsedMs = Math.max(0, this.clock() - record.startedAt) }
    }
  }
}
