/**
 * Decision 7 of #1887 (ADR 0052): a Workshop draft whose ability is still in
 * the retired CARD_DEF / CARD_IMPL sandbox format is converted once to a native
 * Card Source module, by the normalization pull-request generation applied to
 * those drafts. A converted draft is checked like any new source.
 *
 * A draft that cannot be converted keeps its source text, loses its validation
 * evidence (compiled code and manifest) and so reads as "not validated". The
 * retired format itself tells the Workshop to ask for a new Generation Attempt.
 * Saved versions are history and stay as they are.
 */
import type { PostgresDatabase } from './postgres'
import { isNativeCardSource } from '../../shared/custom-code/card-source-admission.ts'
import { convertLegacyCardSource } from '../workshop-pr/legacy-card-source.ts'
import { prepareNativeAbilityCode } from '../workshop-draft-validation.ts'

type DraftRow = { id: string; card_id: string; card_type: string; card_json: string; code_manifest: string | null }

export type LegacyDraftConversion = { converted: string[]; flagged: string[] }

/** Returns the converted source, or null when the draft must be regenerated. */
export function convertLegacyDraftSource(source: string, cardId: string, cardType: string, locales?: Record<string, unknown> | null): string | null {
  try {
    const converted = convertLegacyCardSource(source, cardId, cardType === 'occupation' ? 'occupation' : 'minor', { locales })
    return prepareNativeAbilityCode(converted, cardId).ok ? converted : null
  } catch {
    return null
  }
}

export async function convertLegacyWorkshopDrafts(db: PostgresDatabase): Promise<LegacyDraftConversion> {
  const result: LegacyDraftConversion = { converted: [], flagged: [] }
  const rows = await db.prepare('SELECT id, card_id, card_type, card_json, code_manifest FROM workshop_cards ORDER BY id FOR UPDATE')
    .all<DraftRow>()
  for (const row of rows) {
    let cardJson: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(row.card_json)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
      cardJson = parsed as Record<string, unknown>
    } catch { continue }
    const source = cardJson._code
    if (typeof source !== 'string' || !source.trim() || isNativeCardSource(source)) continue
    const locales = cardJson.locales && typeof cardJson.locales === 'object' && !Array.isArray(cardJson.locales) ? cardJson.locales as Record<string, unknown> : null
    const converted = convertLegacyDraftSource(source, row.card_id, row.card_type, locales)
    const prepared = converted === null ? null : prepareNativeAbilityCode(converted, row.card_id)
    const next: Record<string, unknown> = { ...cardJson }
    delete next._compiled
    let manifest: string | null = null
    if (converted !== null && prepared?.ok) {
      next._code = converted
      next._compiled = prepared.compiledCode
      manifest = JSON.stringify(prepared.codeManifest)
      result.converted.push(row.id)
    } else result.flagged.push(row.id)
    // The new revision makes any open editor reload before it saves over the conversion.
    await db.prepare('UPDATE workshop_cards SET card_json = ?, code_manifest = ?, draft_revision = draft_revision + 1 WHERE id = ?')
      .run(JSON.stringify(next), manifest, row.id)
  }
  return result
}
