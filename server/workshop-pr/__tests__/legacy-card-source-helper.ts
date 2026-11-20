import { convertLegacyCardSource } from '../legacy-card-source'

/** Converts a test card's retired-format source as the legacy-draft migration does. */
export const convertWorkshopCard = (wcard: { card_id: string; card_type: string; effect_code: string }) =>
  convertLegacyCardSource(wcard.effect_code, wcard.card_id, wcard.card_type === 'occupation' ? 'occupation' : 'minor')
