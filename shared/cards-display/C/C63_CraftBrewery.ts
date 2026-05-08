import { MinorImprovement } from '../types'

const CARD_ID = 'C63_CraftBrewery'

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
export const C63_CraftBrewery = new MinorImprovement({
  id: CARD_ID,
  name: "Craft Brewery",
  deck: "C",
  number: 63,
  category: "FOOD_PROVIDER",
  desc: ["In the feeding phase of each harvest, you can use this card to exchange 1 <GRAIN> from your supply plus 1 <GRAIN> from a field for 2 bonus <SCORE> and 4 <FOOD>."],
  cost: { wood: 2, clay: 1 },
})
