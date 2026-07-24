import type { CustomCodeValidateResult } from '../shared/custom-code/types.ts'
import { validateAndCompileCustomCodeRemote } from './custom-code/client.ts'
import type { WorkshopDraft } from './workshop-drafts.ts'

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
  error: string
  errors?: string[]
}

const validateCode = async (
  sourceCode: string,
  cardId: string,
): Promise<
  | {
      ok: true
      compiledCode: string
      codeManifest: Record<string, unknown>
      cardDefinition: Record<string, unknown> | null
    }
  | ValidationFailure
> => {
  let validation: CustomCodeValidateResult
  try {
    validation = await validateAndCompileCustomCodeRemote(sourceCode, cardId)
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: `Executor unavailable: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  if (!validation.valid) {
    return {
      ok: false,
      status: 400,
      error: 'Code validation failed',
      errors: validation.errors,
    }
  }
  return {
    ok: true,
    compiledCode: validation.compiledCode,
    codeManifest: {
      ...validation.manifest,
      cardDefinition: validation.cardDefinition,
    } as unknown as Record<string, unknown>,
    cardDefinition: validation.cardDefinition,
  }
}

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
      generation: raw.generation && typeof raw.generation === 'object' && !Array.isArray(raw.generation)
        ? raw.generation as Record<string, unknown>
        : {},
    },
  }
}
