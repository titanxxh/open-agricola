import type { WorkshopAbilityCandidateContract, WorkshopDraftContract } from '../../../../shared/contract/workshop'
import type { WorkshopVisibleMessage } from '../../../../shared/contract/workshop-generation'
import { abilityDraftFingerprint, canonicalGenerationJson, projectAbilityRequirements, projectVisibleMessages, sourceFingerprint } from '../../../../shared/projections/workshop-generation'

export type PlaytestSource = {
  workspaceId: string
  versionId: string
  source: string
  sourceFingerprint: string
  identity: { id: string; type: 'minor' | 'occupation'; name: string }
  gameSeed?: number | string
}
export type PlaytestFailure = PlaytestSource & { errors: string[] }
export type GenerationIntent = { kind: 'generate' | 'follow-up' | 'resend'; message: string }
  | { kind: 'repair'; message: string; failure: PlaytestFailure }
export type GenerationRequest = {
  attemptId: string
  createdAt: number
  workspaceId: string
  baseRevision: number
  draftFingerprint: string
  inputFingerprint: string
  sourceCandidate?: { id: string; fingerprint: string }
  input: {
    intent: GenerationIntent
    card: { id: string; type: 'minor' | 'occupation'; name: string; description: string; definition: Record<string, unknown>; requirements: ReturnType<typeof projectAbilityRequirements> }
    source: string | null
    sourceFingerprint: string | null
    conversation: WorkshopVisibleMessage[]
  }
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}

/** Every entry point captures an immutable input. No config/credential belongs
 * here. A repair always targets the version which actually failed, regardless
 * of which candidate is currently selected in the editor.
 */
export function buildGenerationRequest(options: {
  workspaceId: string
  baseRevision: number
  draft: WorkshopDraftContract
  intent: GenerationIntent
  selectedCandidate?: WorkshopAbilityCandidateContract
  messages?: unknown[]
  attemptId?: string
  now?: number
}): GenerationRequest {
  const { draft, intent } = options
  if (!intent.message.trim()) throw new Error('Describe the requested card behavior first.')
  if (intent.kind === 'repair' && intent.failure.workspaceId !== options.workspaceId) throw new Error('The playtest belongs to a different card workspace.')
  if (intent.kind === 'repair' && sourceFingerprint(intent.failure.source) !== intent.failure.sourceFingerprint) throw new Error('The playtest error does not match its recorded source.')
  const identity = intent.kind === 'repair' ? intent.failure.identity : { id: draft.cardId, type: draft.cardType, name: draft.name }
  if (!identity || identity.id !== draft.cardId || identity.type !== draft.cardType || identity.name !== draft.name) {
    throw new Error('The playtest card identity changed or is missing. Pin the current version and playtest again before repairing.')
  }
  const selected = intent.kind === 'repair' ? undefined : options.selectedCandidate
  const source = intent.kind === 'repair' ? intent.failure.source : selected?.sourceCode ?? draft.effectCode
  const fingerprint = source === null ? null : sourceFingerprint(source)
  // A tested version owns its metadata in the recorded source. The current
  // draft (or another selected candidate) may describe a different version.
  const cardJson = intent.kind === 'repair' ? {} : selected?.cardJson ?? draft.cardJson
  const definition = { ...cardJson }
  const description = intent.kind === 'repair' ? '' : selected
    ? (Array.isArray(cardJson.desc) ? cardJson.desc.filter((line): line is string => typeof line === 'string').join('\n') : '')
    : draft.description
  delete definition._draft
  delete definition._code
  delete definition._compiled
  const input: GenerationRequest['input'] = structuredClone({
    intent,
    card: { ...identity, description, definition, requirements: projectAbilityRequirements(cardJson) },
    source,
    sourceFingerprint: fingerprint,
    conversation: projectVisibleMessages(options.messages).filter(message => !message.interrupted && !message.isError).slice(-12).map(message => ({
      role: message.role,
      content: message.content.replace(/```(?:typescript|ts|javascript|js)?\s*\n[\s\S]*?```/g, '[Earlier code omitted; use the current source below.]').slice(0, 8000),
    })),
  })
  return freeze({
    attemptId: options.attemptId ?? crypto.randomUUID(), createdAt: options.now ?? Date.now(),
    workspaceId: options.workspaceId, baseRevision: options.baseRevision, draftFingerprint: abilityDraftFingerprint(draft),
    inputFingerprint: sourceFingerprint(canonicalGenerationJson(input)), input,
    ...(selected ? { sourceCandidate: { id: selected.id, fingerprint: sourceFingerprint(selected.sourceCode) } } : {}),
  })
}

export type GenerationOutput = { kind: 'source'; source: string; message: string }
  | { kind: 'clarification' | 'capability-gap' | 'reference-continuation'; message: string }

export function extractGenerationOutput(text: string): GenerationOutput {
  const sourceBlocks = [...text.matchAll(/```(?:typescript|ts)\s*\r?\n([\s\S]*?)```/g)]
  if (sourceBlocks.length === 1) {
    const source = sourceBlocks[0][1].trim()
    if (!source.includes('CARD_DEF') || !source.includes('CARD_IMPL')) throw new Error('The completed response did not include a complete CARD_DEF and CARD_IMPL source.')
    return { kind: 'source', source, message: text.replace(sourceBlocks[0][0], '').trim() }
  }
  if (sourceBlocks.length > 1) throw new Error('The completed response contains multiple source candidates; request one complete source.')
  const json = /```json\s*\r?\n([\s\S]*?)```/.exec(text)?.[1] ?? text
  try {
    const value = JSON.parse(json) as Record<string, unknown>
    if ((value.kind === 'clarification' || value.kind === 'capability-gap' || value.kind === 'reference-continuation') && typeof value.message === 'string' && value.message.trim()) return { kind: value.kind, message: value.message }
  } catch { /* A malformed final answer must not become a code candidate. */ }
  throw new Error('Expected one complete TypeScript source or a structured clarification/capability gap.')
}
