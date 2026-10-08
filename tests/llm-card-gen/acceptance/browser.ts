/** Owner-run acceptance entry point, dynamically imported by Playwright.
 * This module is not reachable from the product bundle. It executes the
 * production browser runner and captures unmodified single-file sources.
 */
import { GenerationAttempt, GenerationStopError, type AttemptSnapshot, type CodeValidation, type RequestAccounting } from '../../../client/services/llm/generation/attempt'
import { createSandboxPorts } from '../../../client/services/llm/generation/browser'
import { buildGenerationRequest } from '../../../client/services/llm/generation/request'
import { createToolTransport, ModelTurnError, UNKNOWN_USAGE, type WireMessage } from '../../../client/services/llm/generation/protocol'
import { ReferenceSession } from '../../../client/services/llm/generation/references'
import type { GenerationReference, GenerationUsage } from '../../../shared/contract/workshop-generation'
import { sourceFingerprint } from '../../../shared/projections/workshop-generation'
import type { LlmConfig } from '../../../client/services/llm/types'
import type { AcceptanceInput } from './inputs'

export type ReservationRequest = { task: string; sequence: number; inputBytes: number; maxOutputTokens: number }
export type Settlement = { id: string; usage: GenerationUsage; notPosted: boolean }
declare global {
  interface Window {
    acceptanceReserve(request: ReservationRequest): Promise<string>
    acceptanceSettle(settlement: Settlement): Promise<void>
  }
}
export type BrowserTaskResult = {
  inputFingerprint: string
  snapshot: AttemptSnapshot
  requests: RequestAccounting[]
  answers: Array<{ sequence: number; text: string; textBytes: number; sha256: string; truncated: boolean }>
  sources: Array<{ source: string; validation?: CodeValidation }>
  referenceReads: GenerationReference[]
  referenceOperations: Array<{ tool: string; query?: string; path?: string; startLine?: number; lineCount?: number; elapsedMs: number; resultBytes?: number; ok: boolean; error?: string }>
  referenceHttp: Array<{ url: string; elapsedMs: number; status?: number; failed?: boolean }>
  protocol: { assistantMessagesChecked: number; toolGroupsChecked: number; opaqueFieldsPresent: string[]; preserved: boolean }
}

export async function runBrowserTask(options: {
  task: string; input: AcceptanceInput; config: LlmConfig
  sandboxContractId: string
}): Promise<BrowserTaskResult> {
  const request = buildGenerationRequest(options.input)
  const sources: BrowserTaskResult['sources'] = []
  const answers: BrowserTaskResult['answers'] = []
  const referenceReads: GenerationReference[] = []
  const referenceOperations: BrowserTaskResult['referenceOperations'] = []
  const referenceHttp: BrowserTaskResult['referenceHttp'] = []
  const protocol: BrowserTaskResult['protocol'] = { assistantMessagesChecked: 0, toolGroupsChecked: 0, opaqueFieldsPresent: [], preserved: true }
  // The following opaque objects live only in this page and never cross the
  // Playwright boundary. Evidence records equality and field names, not values.
  const previous: Array<{ message: WireMessage; index: number; callIds: string[] }> = []
  let reservation: string | undefined
  let sequence = 0
  const transport = createToolTransport(options.config, {
    authorize(target) {
      if (target.provider !== 'deepseek' || target.endpoint !== 'https://api.deepseek.com/v1/chat/completions' || target.model !== options.config.model) throw new Error('Unexpected acceptance destination')
    },
    beforePost: async body => {
      const payload = JSON.parse(body) as { max_tokens: number }
      reservation = await window.acceptanceReserve({ task: options.task, sequence: ++sequence, inputBytes: new TextEncoder().encode(body).length, maxOutputTokens: payload.max_tokens })
    },
  })
  const sandbox = createSandboxPorts((path, init) => fetch(path, { ...init, credentials: 'include' }))
  const openReferences = ReferenceSession.createOpener(async (url, init) => {
    const entry: BrowserTaskResult['referenceHttp'][number] = { url: String(url), elapsedMs: 0 }
    const started = Date.now()
    referenceHttp.push(entry)
    try {
      const response = await fetch(url, init)
      entry.status = response.status
      return response
    } catch (error) { entry.failed = true; throw error } finally { entry.elapsedMs = Date.now() - started }
  })
  const attempt = new GenerationAttempt(request, {
    ...sandbox,
    loadContract: async signal => {
      const contract = await sandbox.loadContract(signal)
      if (contract.id !== options.sandboxContractId) throw new GenerationStopError('The frozen sandbox deployment changed during this batch.')
      return contract
    },
    openReferences: async signal => {
      const references = await openReferences(signal)
      return { commit: references.commit, reads: references.reads, execute: async (call, signal) => {
        const entry: BrowserTaskResult['referenceOperations'][number] = { tool: call.function.name, elapsedMs: 0, ok: false }
        const started = Date.now()
        referenceOperations.push(entry)
        try {
          const args = JSON.parse(call.function.arguments) as Record<string, unknown>
          if (typeof args.query === 'string') entry.query = args.query.slice(0, 200)
          if (typeof args.path === 'string') entry.path = args.path.slice(0, 500)
          if (typeof args.startLine === 'number') entry.startLine = args.startLine
          if (typeof args.lineCount === 'number') entry.lineCount = args.lineCount
        } catch { /* Malformed arguments are still handled by the real tool. */ }
        try {
          const result = await references.execute(call, signal)
          entry.resultBytes = new TextEncoder().encode(result).length
          const data = JSON.parse(result) as { error?: string }
          entry.ok = !data.error
          entry.error = data.error
          return result
        } catch (error) { entry.error = error instanceof Error ? error.message : 'Reference failed'; throw error }
        finally { entry.elapsedMs = Date.now() - started; referenceReads.splice(0, referenceReads.length, ...references.reads) }
      } }
    },
    validate: async (source, cardId, contractId, signal) => {
      const entry: BrowserTaskResult['sources'][number] = { source }
      sources.push(entry)
      const result = await sandbox.validate(source, cardId, contractId, signal)
      entry.validation = result
      return result
    },
    model: {
      target: transport.target,
      complete: async (messages, tools, signal, onText, turnOptions) => {
        for (const prior of previous) {
          const unchanged = JSON.stringify(messages[prior.index]) === JSON.stringify(prior.message)
          const replies = messages.slice(prior.index + 1, prior.index + 1 + prior.callIds.length)
          const matching = replies.every((reply, index) => reply.role === 'tool' && reply.tool_call_id === prior.callIds[index]) && replies.length === prior.callIds.length
          protocol.assistantMessagesChecked += 1
          if (prior.callIds.length) protocol.toolGroupsChecked += 1
          protocol.preserved &&= unchanged && matching
          if (!protocol.preserved) throw new GenerationStopError('The browser did not preserve the provider protocol before the next POST.')
        }
        reservation = undefined
        let turn
        try { turn = await transport.complete(messages, tools, signal, onText, turnOptions) } catch (error) {
          if (reservation) await window.acceptanceSettle({ id: reservation, usage: error instanceof ModelTurnError ? error.usage : UNKNOWN_USAGE, notPosted: error instanceof ModelTurnError && error.kind === 'preflight' })
          throw error
        }
        if (reservation) await window.acceptanceSettle({ id: reservation, usage: turn.usage, notPosted: false })
        if (!turn.calls.length) {
          // Retain visible final answers even when parsing rejects their format.
          // Opaque provider messages, reasoning and signatures stay page-local.
          const bytes = new TextEncoder().encode(turn.text)
          const truncated = bytes.length > 64 * 1024
          // Preserve a leading BOM and omit a partial UTF-8 character at the cap.
          answers.push({ sequence, text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes.subarray(0, 64 * 1024), { stream: truncated }),
            textBytes: bytes.length, sha256: sourceFingerprint(turn.text), truncated })
        }
        previous.push({ message: structuredClone(turn.message), index: messages.length, callIds: turn.calls.map(call => call.id) })
        for (const key of Object.keys(turn.message)) if (!['role', 'content', 'tool_calls'].includes(key) && !protocol.opaqueFieldsPresent.includes(key)) protocol.opaqueFieldsPresent.push(key)
        return turn
      },
    },
  })
  const snapshot = await attempt.start()
  return { inputFingerprint: request.inputFingerprint, snapshot, requests: attempt.requestAccounting(), answers, sources, referenceReads, referenceOperations, referenceHttp, protocol }
}
