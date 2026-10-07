import type { WorkshopSandboxContract } from '../../../../shared/contract/workshop-generation'
import type { LlmConfig } from '../types'
import { createToolTransport } from './protocol'
import { ReferenceSession } from './references'
import { GenerationStopError, type AttemptPorts, type CodeValidation } from './attempt'

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>

/** Backend requests contain only the sandbox contract or source validation.
 * The LLM config is captured solely by the provider transport closure.
 */
export function createBrowserGenerationPorts(config: LlmConfig, apiFetch: ApiFetch): AttemptPorts {
  return {
    model: createToolTransport(config),
    openReferences: signal => ReferenceSession.open(signal),
    ...createSandboxPorts(apiFetch),
  }
}

export function createSandboxPorts(apiFetch: ApiFetch): Pick<AttemptPorts, 'loadContract' | 'validate'> {
  return {
    async loadContract(signal) {
      const response = await apiFetch('/api/workshop/sandbox-contract', { signal, cache: 'no-store' })
      const data = await response.json() as { contract?: WorkshopSandboxContract }
      if (!response.ok || !data.contract || data.contract.format !== 1 || !/^sandbox-v1:[a-f0-9]{64}$/.test(data.contract.id)) throw new Error('The deployed sandbox contract is unavailable. Retry before generating code.')
      return data.contract
    },
    async validate(source, cardId, sandboxContractId, signal) {
      const response = await apiFetch('/api/workshop/cards/validate-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ source, card_id: cardId, sandboxContractId }),
      })
      const data = await response.json() as Partial<CodeValidation> & { ok?: boolean; code?: string }
      if (data.code === 'sandbox_changed') throw new GenerationStopError('The deployed sandbox changed. Start a new attempt with the updated contract.')
      if (!response.ok || !data.ok || typeof data.valid !== 'boolean' || !data.sourceFingerprint || !data.sandboxContractId) throw new Error('Code validation is unavailable. Retry validation; no model repair has been requested.')
      return { valid: data.valid, errors: data.errors ?? [], sourceFingerprint: data.sourceFingerprint, sandboxContractId: data.sandboxContractId, cardJson: data.cardJson }
    },
  }
}
