import { defineMinorCard } from '../card-source'
/**
 * C63 Craft Brewery — In the feeding phase of each harvest, exchange 1 grain
 * from supply + 1 grain from a field for 4 food + 2 bonus VP.
 *
 * BGA `onPlayerHarvestFeedingPhase`:
 *   - 1 grain field: SE eatSingleFieldGrain + payGain.
 *   - 2+ grain fields: SE eatFieldGrain prompts player to pick which field.
 *
 * Implementation: route field-grain decrement through the engine via the
 * `special-effect` leaf (kind `remove-field-crop`, crop:grain,
 * minRemaining:1) instead of mutating `player.fields` imperatively. This
 * preserves undo / replay semantics. **§2.5 simplification:** when 2+ grain
 * fields exist the player is NOT asked to pick — the SE picks the first
 * matching field. Implementing the picker requires a new SE kind + UI.
 */

import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'C063_CraftBrewery'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onHarvestFeedingPhase: (_state, player) => {
      if (player.resources.grain < 1) return
      const hasGrainField = player.fields.some((f) => fieldHasCrop(f, 'grain'))
      if (!hasGrainField) return
      return {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            params: { kind: 'remove-field-crop', crop: 'grain', minRemaining: 1 },
            sourceCard: CARD_ID,
          },
          { type: 'leaf', actionId: 'pay-resources', params: { grain: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 4 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C063_CraftBrewery = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Craft Brewery",
    deck: "C",
    number: 63,
    category: "FOOD_PROVIDER",
    desc: ["In the feeding phase of each harvest, you can use this card to exchange 1 <GRAIN> from your supply plus 1 <GRAIN> from a field for 2 bonus <SCORE> and 4 <FOOD>."],
    cost: { wood: 2, clay: 1 },
    extraVp: true,
  },
  impl: cardImpl,
})

export const C063_CraftBrewery_impl = C063_CraftBrewery.impl
