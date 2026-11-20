import { admitNativeCardSource, isNativeCardSource, LEGACY_CARD_SOURCE_MESSAGE } from '../shared/custom-code/card-source-admission.ts'
import { compileCardCode } from '../shared/custom-code/compiler.ts'
import type { WorkshopDraft } from './workshop-drafts.ts'
import { projectWorkshopGeneration } from '../shared/projections/workshop-generation.ts'

export type WorkshopDraftRequest = {
  cardId?: unknown
  cardType?: unknown
  name?: unknown
  description?: unknown
  cardJson?: unknown
  effectCode?: unknown
  artUrl?: unknown
  generation?: unknown
}

type ValidationFailure = {
  ok: false
  status: number
  /** `legacy_card_format`: the source uses the retired CARD_DEF / CARD_IMPL format. */
  code?: 'legacy_card_format'
  error: string
  errors?: string[]
}

export type PreparedAbilityCode = {
  ok: true
  compiledCode: string
  codeManifest: Record<string, unknown>
  cardDefinition: Record<string, unknown> | null
}

/**
 * Checks a native Card Source module's structure without executing it; only
 * the author's opaque browser Worker runs Workshop code (ADR 0052). A source in
 * the retired sandbox format is rejected and must be regenerated.
 */
export const prepareNativeAbilityCode = (sourceCode: string, cardId: string): PreparedAbilityCode | ValidationFailure => {
  if (!isNativeCardSource(sourceCode)) {
    return { ok: false, status: 400, code: 'legacy_card_format', error: LEGACY_CARD_SOURCE_MESSAGE, errors: [LEGACY_CARD_SOURCE_MESSAGE] }
  }
  const admission = admitNativeCardSource(sourceCode, cardId)
  if (!admission.valid) return { ok: false, status: 400, error: 'Code validation failed', errors: admission.errors }
  const cardDefinition = { cardType: admission.cardType, meta: admission.meta }
  return {
    ok: true,
    compiledCode: compileCardCode(sourceCode),
    codeManifest: { format: 'native-card-source', effectHooks: [], listeners: [], cardDefinition },
    cardDefinition,
  }
}

const validateCode = async (sourceCode: string, cardId: string): Promise<PreparedAbilityCode | ValidationFailure> =>
  prepareNativeAbilityCode(sourceCode, cardId)

export const prepareWorkshopAbilityCode = validateCode

export const workshopCardJsonFromDefinition = (
  definition: Record<string, unknown> | null,
): Record<string, unknown> | null => {
  if (!definition) return null
  const cardType = definition.cardType
  const meta = definition.meta
  if (
    (cardType !== 'minor' && cardType !== 'occupation')
    || !meta
    || typeof meta !== 'object'
    || Array.isArray(meta)
  ) return null
  const cardJson = meta as Record<string, unknown>
  if (typeof cardJson.id !== 'string' || typeof cardJson.name !== 'string') return null
  const prerequisite = cardJson.prerequisite
  let normalizedPrerequisite: Record<string, unknown> = {}
  if (prerequisite !== undefined && typeof prerequisite !== 'string') {
    if (!prerequisite || typeof prerequisite !== 'object' || Array.isArray(prerequisite)) return null
    const occupationCount = (prerequisite as Record<string, unknown>).occupation
    if (typeof occupationCount !== 'number' || !Number.isInteger(occupationCount) || occupationCount < 0) return null
    normalizedPrerequisite = {
      prerequisite: `${occupationCount} Occupations`,
      occupationPrerequisites: { min: occupationCount },
    }
  }
  return {
    ...cardJson,
    ...normalizedPrerequisite,
    name: cardJson.name.trim(),
    card_type: cardType,
    deck: 'CUSTOM',
    number: 0,
    implemented: true,
  }
}

export const prepareWorkshopDraft = async (
  raw: WorkshopDraftRequest | null | undefined,
): Promise<
  | { ok: true; draft: WorkshopDraft }
  | ValidationFailure
> => {
  if (
    !raw
    || typeof raw.cardId !== 'string'
    || typeof raw.cardType !== 'string'
    || typeof raw.name !== 'string'
    || typeof raw.cardJson !== 'object'
    || raw.cardJson === null
    || Array.isArray(raw.cardJson)
  ) {
    return { ok: false, status: 400, error: 'Invalid draft payload' }
  }
  const effectCode = typeof raw.effectCode === 'string' && raw.effectCode.trim()
    ? raw.effectCode
    : null
  let compiledCode: string | null = null
  let codeManifest: Record<string, unknown> | null = null
  if (effectCode) {
    const prepared = await validateCode(effectCode, raw.cardId)
    if (!prepared.ok) return prepared
    compiledCode = prepared.compiledCode
    codeManifest = prepared.codeManifest
  }
  return {
    ok: true,
    draft: {
      cardId: raw.cardId,
      cardType: raw.cardType as WorkshopDraft['cardType'],
      name: raw.name,
      description: typeof raw.description === 'string' ? raw.description : '',
      cardJson: raw.cardJson as Record<string, unknown>,
      effectCode,
      compiledCode,
      codeManifest,
      artUrl: typeof raw.artUrl === 'string' && raw.artUrl ? raw.artUrl : null,
      generation: projectWorkshopGeneration(raw.generation),
    },
  }
}
