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
    codeManifest: validation.manifest as unknown as Record<string, unknown>,
  }
}

export const prepareWorkshopAbilityCode = validateCode

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
