/** A hand selection is a subset: one card cannot occupy multiple selected slots. */
export const validateOccupationHandSelection = (input: {
  cards: readonly string[]
  hand: readonly string[]
  minSelections: number
  maxSelections?: number
}): { ok: true } | { ok: false; error: string } => {
  if (input.cards.length < input.minSelections) return { ok: false, error: 'not enough card selections' }
  if (input.maxSelections !== undefined && input.cards.length > input.maxSelections) {
    return { ok: false, error: 'too many card selections' }
  }
  if (new Set(input.cards).size !== input.cards.length) return { ok: false, error: 'duplicate card selection' }
  for (const card of input.cards) {
    if (!input.hand.includes(card)) return { ok: false, error: `card ${card} not in occupation hand` }
  }
  return { ok: true }
}
