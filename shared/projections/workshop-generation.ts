import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import type { WorkshopAbilityCandidateContract, WorkshopDraftContract } from '../contract/workshop'
import type { GenerationProvenance, GenerationResult, WorkshopVisibleMessage } from '../contract/workshop-generation'

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown, limit = 2000): string => typeof value === 'string' ? value.slice(0, limit) : ''
const count = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
const tokens = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

export const sourceFingerprint = (source: string): string => bytesToHex(sha256(utf8ToBytes(source)))

export function canonicalGenerationJson(value: unknown): string {
  const sort = (item: unknown): unknown => Array.isArray(item) ? item.map(sort)
    : item && typeof item === 'object'
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, sort(entry)]))
      : item
  return JSON.stringify(sort(value))
}

/** Preserve authored rules that the metadata editor's numeric cost parser cannot express. */
export function projectAbilityRequirements(cardJson: Record<string, unknown>): { cost?: string; prerequisite?: string } {
  const draft = record(cardJson._draft)
  return {
    ...(typeof draft.costInput === 'string' && draft.costInput.trim() ? { cost: draft.costInput } : {}),
    ...(typeof draft.prerequisite === 'string' && draft.prerequisite.trim() ? { prerequisite: draft.prerequisite } : {}),
  }
}

/** Art and generation bookkeeping do not change the ability input. */
export function abilityDraftFingerprint(draft: WorkshopDraftContract): string {
  const cardJson = { ...draft.cardJson }
  delete cardJson._draft
  delete cardJson._compiled
  return sourceFingerprint(canonicalGenerationJson({
    cardId: draft.cardId, cardType: draft.cardType, name: draft.name,
    description: draft.description, cardJson, requirements: projectAbilityRequirements(draft.cardJson), effectCode: draft.effectCode,
  }))
}

export function projectGenerationProvenance(value: unknown): GenerationProvenance | undefined {
  const raw = record(value)
  if (!text(raw.attemptId)) return undefined
  let endpoint = ''
  try {
    const url = new URL(text(raw.endpoint))
    if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash) endpoint = url.href
  } catch { /* Incomplete legacy provenance has no endpoint. */ }
  const usage = record(raw.usage)
  const referenceCommit = /^[a-f0-9]{40}$/.test(text(raw.referenceCommit)) ? text(raw.referenceCommit) : undefined
  return {
    attemptId: text(raw.attemptId, 200), inputFingerprint: text(raw.inputFingerprint, 64),
    ...(typeof raw.sourceFingerprint === 'string' ? { sourceFingerprint: text(raw.sourceFingerprint, 64) } : {}),
    ...(referenceCommit ? { referenceCommit } : {}),
    ...(typeof raw.sandboxContractId === 'string' ? { sandboxContractId: text(raw.sandboxContractId, 100) } : {}),
    promptVersion: text(raw.promptVersion, 100), toolVersion: text(raw.toolVersion, 100),
    provider: text(raw.provider, 100), endpoint, model: text(raw.model, 200),
    ...(typeof raw.returnedModel === 'string' ? { returnedModel: text(raw.returnedModel, 200) } : {}),
    modelRequests: count(raw.modelRequests), referenceCalls: count(raw.referenceCalls), repairs: count(raw.repairs), elapsedMs: count(raw.elapsedMs),
    usage: { inputTokens: tokens(usage.inputTokens), outputTokens: tokens(usage.outputTokens), cachedInputTokens: tokens(usage.cachedInputTokens), reasoningTokens: tokens(usage.reasoningTokens) },
    references: (Array.isArray(raw.references) ? raw.references : []).slice(-24).flatMap(value => {
      const ref = record(value)
      const path = text(ref.path, 300)
      if (!referenceCommit || !/^[\w./-]+$/.test(path) || path.split('/').includes('..')) return []
      const startLine = Math.max(1, Math.floor(count(ref.startLine)))
      const endLine = Math.max(startLine, Math.floor(count(ref.endLine)))
      return [{ path, startLine, endLine, url: `https://github.com/titanxxh/open-agricola/blob/${referenceCommit}/${path}#L${startLine}-L${endLine}` }]
    }),
  }
}

export function projectAbilityCandidate(value: unknown): WorkshopAbilityCandidateContract | undefined {
  const raw = record(value)
  if (!text(raw.id) || typeof raw.sourceCode !== 'string' || typeof raw.prompt !== 'string') return undefined
  const validation = record(raw.validation)
  const fingerprint = sourceFingerprint(raw.sourceCode)
  const provenance = projectGenerationProvenance(raw.provenance)
  return {
    id: text(raw.id, 200), kind: 'ability', prompt: text(raw.prompt, 16000), createdAt: count(raw.createdAt),
    sourceCode: raw.sourceCode, cardJson: record(raw.cardJson), sourceFingerprint: fingerprint,
    ...(typeof raw.inputFingerprint === 'string' ? { inputFingerprint: text(raw.inputFingerprint, 64) } : {}),
    ...(typeof raw.provider === 'string' ? { provider: text(raw.provider, 100) } : {}),
    ...(typeof raw.model === 'string' ? { model: text(raw.model, 200) } : {}),
    ...(provenance ? { provenance } : {}),
    validation: {
      valid: validation.valid === true && (!validation.sourceFingerprint || validation.sourceFingerprint === fingerprint),
      errors: (Array.isArray(validation.errors) ? validation.errors : []).filter((entry): entry is string => typeof entry === 'string').slice(0, 30).map(entry => entry.slice(0, 2000)),
      sourceFingerprint: fingerprint,
      ...(typeof validation.sandboxContractId === 'string' ? { sandboxContractId: text(validation.sandboxContractId, 100) } : {}),
    },
  }
}

export function projectGenerationResult(value: unknown): GenerationResult | undefined {
  const raw = record(value)
  const kinds = ['candidate', 'failed-source', 'clarification', 'capability-gap', 'failure', 'interrupted'] as const
  const kind = kinds.find(kind => kind === raw.kind)
  if (!kind || !text(raw.attemptId)) return undefined
  const provenance = projectGenerationProvenance(raw.provenance)
  const failedCandidate = kind === 'failed-source' ? projectAbilityCandidate(raw.failedCandidate) : undefined
  return {
    kind, attemptId: text(raw.attemptId, 200), createdAt: count(raw.createdAt), message: text(raw.message, 16000),
    ...(provenance ? { provenance } : {}),
    ...(typeof raw.candidateId === 'string' ? { candidateId: text(raw.candidateId, 200) } : {}),
    ...(typeof raw.sourceFingerprint === 'string' ? { sourceFingerprint: text(raw.sourceFingerprint, 64) } : {}),
    ...(failedCandidate ? { failedCandidate: { ...failedCandidate, validation: { ...failedCandidate.validation, valid: false } } } : {}),
  }
}

function projectAdoptedAbility(value: unknown): Record<string, unknown> | undefined {
  const candidate = projectAbilityCandidate(value)
  const raw = candidate ?? record(value)
  if (typeof raw.id !== 'string' || typeof raw.prompt !== 'string') return undefined
  const provenance = projectGenerationProvenance(raw.provenance)
  return {
    id: text(raw.id, 200), kind: 'ability', prompt: text(raw.prompt, 16000), createdAt: count(raw.createdAt),
    ...(typeof raw.sourceFingerprint === 'string' ? { sourceFingerprint: text(raw.sourceFingerprint, 64) } : {}),
    ...(typeof raw.inputFingerprint === 'string' ? { inputFingerprint: text(raw.inputFingerprint, 64) } : {}),
    ...(typeof raw.provider === 'string' ? { provider: text(raw.provider, 100) } : {}),
    ...(typeof raw.model === 'string' ? { model: text(raw.model, 200) } : {}),
    ...(provenance ? { provenance } : {}),
  }
}

/** An explicit projection, never a spread of provider or session objects. */
export function projectWorkshopGeneration(value: unknown): Record<string, unknown> {
  const raw = record(value)
  const result: Record<string, unknown> = {}
  const ability = record(raw.ability)
  const lastValid = projectAbilityCandidate(ability.lastValid)
  const adopted = projectAdoptedAbility(ability.adopted)
  const latestResult = projectGenerationResult(ability.latestResult)
  if (lastValid || adopted || latestResult) result.ability = {
    ...(lastValid?.validation.valid && !(lastValid.id === adopted?.id && lastValid.sourceFingerprint === adopted.sourceFingerprint) ? { lastValid } : {}),
    ...(adopted ? { adopted } : {}),
    ...(latestResult ? { latestResult } : {}),
  }
  const art = record(raw.art)
  if (Object.keys(art).length) {
    const projected: Record<string, unknown> = {}
    if (typeof art.subject === 'string') projected.subject = text(art.subject, 16000)
    if (typeof art.resultUrl === 'string') projected.resultUrl = art.resultUrl
    for (const key of ['lastCompleted', 'adopted']) {
      const candidate = record(art[key])
      if (typeof candidate.id !== 'string' || typeof candidate.resultUrl !== 'string') continue
      const subject = candidate.promptFormat === 'subject' ? text(candidate.prompt, 16000)
        : candidate.provider === 'upload' ? text(art.subject, 16000) || 'Manually uploaded image' : undefined
      if (subject === undefined) continue
      projected[key] = {
        id: text(candidate.id, 200), kind: 'art', prompt: subject, promptFormat: 'subject', resultUrl: candidate.resultUrl,
        createdAt: count(candidate.createdAt),
        ...(typeof candidate.provider === 'string' ? { provider: text(candidate.provider, 100) } : {}),
        ...(typeof candidate.model === 'string' ? { model: text(candidate.model, 200) } : {}),
        ...(Array.isArray(candidate.referenceImages) ? { referenceImages: candidate.referenceImages.filter((entry): entry is string => typeof entry === 'string').slice(0, 10) } : {}),
      }
    }
    result.art = projected
  }
  return result
}

export function projectVisibleMessages(value: unknown): WorkshopVisibleMessage[] {
  if (!Array.isArray(value)) return []
  return value.slice(-100).flatMap(value => {
    const raw = record(value)
    if ((raw.role !== 'user' && raw.role !== 'assistant') || typeof raw.content !== 'string') return []
    return [{
      role: raw.role, content: text(raw.content, 64000),
      ...(typeof raw.attemptId === 'string' ? { attemptId: text(raw.attemptId, 200) } : {}),
      ...(raw.isError === true ? { isError: true } : {}),
      ...(raw.streaming === true || raw.interrupted === true ? { interrupted: true } : {}),
    }]
  })
}
