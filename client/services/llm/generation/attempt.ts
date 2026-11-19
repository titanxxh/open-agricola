import type { WorkshopAbilityCandidateContract, WorkshopBrowserTestOutcome } from '../../../../shared/contract/workshop'
import type { GenerationFeasibility, GenerationProvenance, GenerationResult, GenerationUsage, WorkshopSandboxContract } from '../../../../shared/contract/workshop-generation'
import { abilityArtifactFingerprint, isAbilityCandidateReady, projectGenerationFeasibility, sourceFingerprint } from '../../../../shared/projections/workshop-generation'
import { GENERATION_PROMPT_VERSION, generationSystemPrompt } from './prompt'
import { matchesGenerationIdentity, type GenerationRequest } from './request'
import type { ReferenceSession } from './references'
import { ModelTurnError, UNKNOWN_USAGE, type ToolCall, type ToolTransport, type WireMessage } from './protocol'
import { GENERATION_TOOLS, GENERATION_TOOL_VERSION } from './tools'

export type CodeValidation = { valid: boolean; errors: string[]; sourceFingerprint: string; sandboxContractId: string; cardJson?: Record<string, unknown> }
export type AttemptPorts = {
  model: ToolTransport
  loadContract(signal: AbortSignal): Promise<WorkshopSandboxContract>
  openReferences(signal: AbortSignal): Promise<Pick<ReferenceSession, 'commit' | 'reads' | 'execute'>>
  validate(source: string, cardId: string, contractId: string, signal: AbortSignal): Promise<CodeValidation>
  runTests(source: string, tests: string, signal: AbortSignal): Promise<{ browserRuntimeId: string; outcome: WorkshopBrowserTestOutcome }>
  now?: () => number
}
type Stage = 'initializing' | 'model' | 'tools' | 'validation' | 'testing'
export type AttemptSnapshot = {
  attemptId: string
  status: 'ready' | 'running' | 'paused' | 'completed' | 'cancelled'
  stage: Stage
  reason?: string
  retry?: Stage
  modelRequests: number
  referenceCalls: number
  activeMs: number
  usage: GenerationUsage
  referenceCommit?: string
  sandboxContractId?: string
  result?: GenerationResult
  candidate?: WorkshopAbilityCandidateContract
  feasibility?: GenerationFeasibility
}
export type RequestAccounting = {
  sequence: number; inputBytes: number; startedAt: number; elapsedMs: number
  usage: GenerationUsage; finishReason: string; returnedModel?: string; requestId?: string; responseWireBytes?: number
}

export class GenerationStopError extends Error {}

/** Protocol messages and resumable tool progress exist only in page memory. */
export class GenerationAttempt {
  readonly request: GenerationRequest
  private readonly ports: AttemptPorts
  private readonly observe: (snapshot: AttemptSnapshot) => void
  private readonly onText: (text: string) => void
  private readonly clock: () => number
  private readonly messages: WireMessage[] = []
  private readonly accounting: RequestAccounting[] = []
  private status: AttemptSnapshot['status'] = 'ready'
  private stage: Stage = 'initializing'
  private reason?: string
  private retry?: Stage
  private references?: Awaited<ReturnType<AttemptPorts['openReferences']>>
  private contract?: WorkshopSandboxContract
  private pendingCalls?: { calls: ToolCall[]; next: number }
  private lastCandidate?: WorkshopAbilityCandidateContract
  private feasibility?: GenerationFeasibility
  private result?: GenerationResult
  private referenceCalls = 0
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
      modelRequests: this.accounting.length, referenceCalls: this.referenceCalls,
      activeMs: this.activeMs + (this.startedAt === undefined ? 0 : Math.max(0, this.clock() - this.startedAt)),
      usage, referenceCommit: this.references?.commit, sandboxContractId: this.contract?.id,
      result: this.result, candidate: this.lastCandidate, feasibility: this.feasibility,
    })
  }

  requestAccounting(): RequestAccounting[] { return structuredClone(this.accounting) }

  start(): Promise<AttemptSnapshot> {
    if (this.status !== 'ready') return this.running ?? Promise.resolve(this.snapshot())
    return this.launch()
  }

  resume(options: { retry?: boolean } = {}): Promise<AttemptSnapshot> {
    if (this.status !== 'paused') return this.running ?? Promise.resolve(this.snapshot())
    if (this.retry && !options.retry) return Promise.resolve(this.snapshot())
    return this.launch()
  }

  cancel(): void {
    if (this.status === 'completed' || this.status === 'cancelled') return
    this.status = 'cancelled'
    this.controller?.abort()
    this.finish('interrupted', 'Generation was cancelled. Written artifacts are retained; unfinished tests do not pass.')
  }

  private publish(): void { this.observe(this.snapshot()) }
  private provenance(): GenerationProvenance {
    const snapshot = this.snapshot()
    return {
      attemptId: this.request.attemptId, inputFingerprint: this.request.inputFingerprint,
      ...(this.lastCandidate ? { sourceFingerprint: sourceFingerprint(this.lastCandidate.sourceCode) } : {}),
      referenceCommit: this.references?.commit, sandboxContractId: this.contract?.id,
      promptVersion: GENERATION_PROMPT_VERSION, toolVersion: GENERATION_TOOL_VERSION,
      ...this.ports.model.target, returnedModel: this.accounting.at(-1)?.returnedModel,
      modelRequests: snapshot.modelRequests, referenceCalls: snapshot.referenceCalls,
      elapsedMs: snapshot.activeMs, usage: snapshot.usage, references: this.references?.reads ?? [],
    }
  }

  private finish(kind: GenerationResult['kind'], message: string): void {
    if (this.status !== 'cancelled') this.status = 'completed'
    if (this.lastCandidate) this.lastCandidate = { ...this.lastCandidate, provenance: this.provenance() }
    const failedCandidate = this.lastCandidate && !isAbilityCandidateReady(this.lastCandidate) ? this.lastCandidate : undefined
    this.result = {
      kind, attemptId: this.request.attemptId, createdAt: this.clock(), message, provenance: this.provenance(),
      ...(this.lastCandidate ? { candidateId: this.lastCandidate.id, sourceFingerprint: sourceFingerprint(this.lastCandidate.sourceCode) } : {}),
      ...(failedCandidate ? { failedCandidate } : {}),
      ...(this.feasibility ? { feasibility: this.feasibility } : {}),
    }
    this.publish()
  }

  private pause(reason: string, retry: Stage): void {
    this.status = 'paused'; this.reason = reason; this.retry = retry
    this.publish()
  }

  private launch(): Promise<AttemptSnapshot> {
    if (this.running) return this.running
    this.status = 'running'; this.reason = undefined; this.retry = undefined
    this.startedAt = this.clock()
    this.controller = new AbortController()
    const signal = this.controller.signal
    this.running = this.drive(signal).catch(error => {
      if (this.status === 'cancelled') return
      if (error instanceof GenerationStopError) this.finish('failure', error.message)
      else this.pause(error instanceof Error ? error.message : 'Generation could not continue.', this.stage)
    }).finally(() => {
      this.activeMs += Math.max(0, this.clock() - this.startedAt!)
      this.startedAt = undefined; this.running = undefined
      this.publish()
    }).then(() => this.snapshot())
    return this.running
  }

  private async execute(call: ToolCall, signal: AbortSignal): Promise<string> {
    const name = call.function.name
    if (name === 'search_references' || name === 'read_reference') {
      if (!this.references) throw new GenerationStopError('References have not been initialized.')
      this.referenceCalls += 1
      return this.references.execute(call, signal)
    }
    let args: unknown
    try { args = JSON.parse(call.function.arguments) } catch { return JSON.stringify({ error: 'Tool arguments must be a JSON object.' }) }
    if (!args || typeof args !== 'object' || Array.isArray(args)) return JSON.stringify({ error: 'Tool arguments must be a JSON object.' })
    if (name === 'report_feasibility') {
      const keys = ['verdict', 'summary', 'evidence', 'gaps', 'questions']
      const feasibility = projectGenerationFeasibility(args)
      if (!feasibility || Object.keys(args).some(key => !keys.includes(key))) {
        return JSON.stringify({ error: 'report_feasibility requires verdict (feasible, needs-info or needs-platform), a non-empty summary, evidence [{path, finding}], gaps and questions.' })
      }
      if (feasibility.verdict !== 'feasible' && !feasibility.evidence.length) return JSON.stringify({ error: 'Cite the code or docs that show the gap or the open rule in evidence.' })
      if (feasibility.verdict === 'needs-platform' && !feasibility.gaps.length) return JSON.stringify({ error: 'List the missing shared mechanisms in gaps.' })
      if (feasibility.verdict === 'needs-info' && !feasibility.questions.length) return JSON.stringify({ error: 'List the questions for the author in questions.' })
      this.feasibility = feasibility
      this.publish()
      return JSON.stringify(feasibility.verdict === 'feasible'
        ? { recorded: 'feasible', next: 'Write the card module and its positive and negative tests with write_artifacts.' }
        : { recorded: feasibility.verdict, next: 'Stop calling tools and explain the verdict to the author in their language.' })
    }
    if (name === 'write_artifacts') {
      if (this.feasibility?.verdict !== 'feasible') return JSON.stringify({ error: 'Research the card, then call report_feasibility with verdict feasible before write_artifacts.' })
      if (!('source' in args) || typeof args.source !== 'string' || !('tests' in args) || typeof args.tests !== 'string'
        || Object.keys(args).length !== 2 || args.source.length > 160000 || args.tests.length > 160000) {
        return JSON.stringify({ error: 'write_artifacts requires complete source and tests strings, each at most 160000 characters.' })
      }
      const fingerprint = sourceFingerprint(args.source)
      const artifactFingerprint = abilityArtifactFingerprint(args.source, args.tests)
      this.lastCandidate = {
        id: `${this.request.attemptId}:${artifactFingerprint.slice(0, 16)}`, kind: 'ability', prompt: this.request.input.intent.message,
        createdAt: this.clock(), sourceCode: args.source, cardJson: {}, sourceFingerprint: fingerprint, inputFingerprint: this.request.inputFingerprint,
        baseRevision: this.request.baseRevision, stale: false,
        provider: this.ports.model.target.provider, model: this.ports.model.target.model,
        validation: { valid: false, errors: ['Code validation has not completed.'], sourceFingerprint: fingerprint, sandboxContractId: this.contract?.id },
        testing: { code: args.tests },
      }
      this.publish()
      return JSON.stringify({ sourceFingerprint: fingerprint, artifactFingerprint, tested: false })
    }
    if (name !== 'run_tests') return JSON.stringify({ error: `Unknown tool: ${name}` })
    if (Object.keys(args).length) return JSON.stringify({ error: 'run_tests takes no arguments.' })
    const artifact = this.lastCandidate
    if (!artifact?.testing || !this.contract) return JSON.stringify({ error: 'Write the complete source and tests with write_artifacts first.' })
    const source = artifact.sourceCode
    const tests = artifact.testing.code
    const fingerprint = sourceFingerprint(source)
    const artifactFingerprint = abilityArtifactFingerprint(source, tests)
    this.lastCandidate = { ...artifact, testing: { code: tests }, validation: { valid: false, errors: ['Code validation has not completed.'] } }
    this.stage = 'validation'; this.publish()
    try {
      const validation = await this.ports.validate(source, this.request.input.card.id, this.contract.id, signal)
      signal.throwIfAborted()
      if (validation.sourceFingerprint !== fingerprint || validation.sandboxContractId !== this.contract.id) throw new GenerationStopError('The validation result belongs to different source or a different sandbox deployment. Start a new attempt.')
      if (validation.valid && !matchesGenerationIdentity(validation.cardJson, this.request.input.card)) {
        validation.valid = false
        validation.errors = [...validation.errors, 'The card definition id, card type and name must match the immutable request identity.']
      }
      this.lastCandidate = { ...this.lastCandidate, cardJson: validation.cardJson ?? {}, validation }
      if (!validation.valid) return JSON.stringify({ artifactFingerprint, validation: { valid: false, errors: validation.errors } })
      this.stage = 'testing'; this.publish()
      const report = await this.ports.runTests(source, tests, signal)
      signal.throwIfAborted()
      this.lastCandidate = { ...this.lastCandidate, testing: { code: tests, lastRun: { artifactFingerprint, ...report } } }
      this.publish()
      return JSON.stringify({ artifactFingerprint, validation: { valid: true, errors: [] }, ...report })
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof GenerationStopError) throw error
      return JSON.stringify({ artifactFingerprint, error: error instanceof Error ? error.message : String(error) })
    }
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
      const pending = this.pendingCalls
      if (pending) {
        while (pending.next < pending.calls.length) {
          signal.throwIfAborted()
          this.stage = 'tools'; this.publish()
          const call = pending.calls[pending.next]
          const content = await this.execute(call, signal)
          signal.throwIfAborted()
          this.messages.push({ role: 'tool', tool_call_id: call.id, content })
          pending.next += 1
        }
        this.pendingCalls = undefined
      }
      const inputBytes = new TextEncoder().encode(JSON.stringify({ messages: this.messages, tools: GENERATION_TOOLS })).length
      this.stage = 'model'
      const record: RequestAccounting = { sequence: this.accounting.length + 1, inputBytes, startedAt: this.clock(), elapsedMs: 0, usage: { ...UNKNOWN_USAGE }, finishReason: 'unknown' }
      this.accounting.push(record); this.publish()
      try {
        const turn = await this.ports.model.complete(this.messages, GENERATION_TOOLS, signal, text => {
          if (!signal.aborted && this.status === 'running') this.onText(text)
        })
        record.usage = turn.usage; record.finishReason = turn.finishReason
        record.returnedModel = turn.returnedModel; record.requestId = turn.requestId
        record.responseWireBytes = turn.responseWireBytes
        signal.throwIfAborted()
        this.messages.push(turn.message)
        if (turn.calls.length) this.pendingCalls = { calls: turn.calls, next: 0 }
        else {
          const verdict = this.feasibility?.verdict
          this.finish(this.lastCandidate ? isAbilityCandidateReady(this.lastCandidate) ? 'candidate' : 'failed-source'
            : verdict === 'needs-info' || verdict === 'needs-platform' ? verdict : 'answer', turn.text)
          return
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
