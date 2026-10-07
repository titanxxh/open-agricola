/** Owner-run acceptance entry point, dynamically imported by Playwright.
 * This module is not reachable from the product bundle. Both arms execute the
 * production browser runner; only the frozen control recipe differs.
 */
import { GenerationAttempt, GenerationStopError, type AttemptSnapshot, type CodeValidation, type RequestAccounting } from '../../../client/services/llm/generation/attempt'
import { createSandboxPorts } from '../../../client/services/llm/generation/browser'
import { buildGenerationRequest } from '../../../client/services/llm/generation/request'
import { createToolTransport, ModelTurnError, UNKNOWN_USAGE, type WireMessage } from '../../../client/services/llm/generation/protocol'
import { ReferenceSession } from '../../../client/services/llm/generation/references'
import type { GenerationUsage } from '../../../shared/contract/workshop-generation'
import type { LlmConfig } from '../../../client/services/llm/types'
import type { AcceptanceInput } from './inputs'

export type Arm = 'tools' | 'control'
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
  sources: Array<{ source: string; validation?: CodeValidation }>
  protocol: { assistantMessagesChecked: number; toolGroupsChecked: number; opaqueFieldsPresent: string[]; preserved: boolean }
}

export async function runBrowserTask(options: {
  task: string; input: AcceptanceInput; arm: Arm; config: LlmConfig
  control: { text: string; sha256: string; sourceCommit: string }
  sandboxContractId: string
}): Promise<BrowserTaskResult> {
  const request = buildGenerationRequest(options.input)
  const sources: BrowserTaskResult['sources'] = []
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
  const attempt = new GenerationAttempt(request, {
    ...sandbox,
    loadContract: async signal => {
      const contract = await sandbox.loadContract(signal)
      if (contract.id !== options.sandboxContractId) throw new GenerationStopError('The frozen sandbox deployment changed during this batch.')
      return contract
    },
    openReferences: options.arm === 'tools' ? signal => ReferenceSession.open(signal)
      : async () => ({ commit: options.control.sourceCommit, reads: [], execute: async () => { throw new Error('The frozen control has no reference tools') } }),
    validate: async (source, cardId, contractId, signal) => {
      const entry: BrowserTaskResult['sources'][number] = { source }
      sources.push(entry)
      const result = await sandbox.validate(source, cardId, contractId, signal)
      entry.validation = result
      return result
    },
    model: {
      target: transport.target,
      complete: async (messages, tools, signal, onText) => {
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
        try { turn = await transport.complete(messages, tools, signal, onText) } catch (error) {
          if (reservation) await window.acceptanceSettle({ id: reservation, usage: error instanceof ModelTurnError ? error.usage : UNKNOWN_USAGE, notPosted: error instanceof ModelTurnError && error.kind === 'preflight' })
          throw error
        }
        if (reservation) await window.acceptanceSettle({ id: reservation, usage: turn.usage, notPosted: false })
        previous.push({ message: structuredClone(turn.message), index: messages.length, callIds: turn.calls.map(call => call.id) })
        for (const key of Object.keys(turn.message)) if (!['role', 'content', 'tool_calls'].includes(key) && !protocol.opaqueFieldsPresent.includes(key)) protocol.opaqueFieldsPresent.push(key)
        return turn
      },
    },
  }, options.arm === 'control' ? { recipe: {
    promptVersion: `frozen-full-prompt:${options.control.sha256}`, toolVersion: 'none',
    systemPrompt: () => options.control.text, tools: [], modelRequests: 3,
  } } : {})
  const snapshot = await attempt.start()
  return { inputFingerprint: request.inputFingerprint, snapshot, requests: attempt.requestAccounting(), sources, protocol }
}
