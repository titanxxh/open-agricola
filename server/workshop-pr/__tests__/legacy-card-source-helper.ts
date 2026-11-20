import { convertLegacyCardSource } from '../legacy-card-source'

/** Converts a test card's retired-format source as the legacy-draft migration does, with the draft's saved translations. */
export const convertWorkshopCard = (wcard: { card_id: string; card_type: string; effect_code: string; card_json?: string }) => {
  const locales = wcard.card_json ? (JSON.parse(wcard.card_json) as { locales?: Record<string, unknown> }).locales : undefined
  return convertLegacyCardSource(wcard.effect_code, wcard.card_id, wcard.card_type === 'occupation' ? 'occupation' : 'minor', { locales })
}
