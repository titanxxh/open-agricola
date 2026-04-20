import { MinorImprovement } from '../types'
import { getLooseStableKeys } from '../../actions/effects/animals'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E83_ShepherdsWhistle'

/**
 * E83 Shepherd's Whistle — At the start of the breeding phase of each harvest,
 * if you have at least 1 unfenced stable without an animal, you get 1 sheep.
 *
 * BGA reference: onPlayerEndHarvestFeedingPhase — checks for empty unfenced stables.
 * The BGA version also offers reorganize if unfenced stables exist but none are empty;
 * we simplify to just checking for an empty unfenced stable (no reorganize flow).
 */

const hasEmptyUnfencedStable = (player: import('../../game/types').PlayerState): boolean => {
  const looseStableKeys = getLooseStableKeys(player)
  return looseStableKeys.some((key) => !player.stableAnimals?.[key])
}

export const E83_ShepherdsWhistle = new MinorImprovement({
  id: CARD_ID,
  name: "Shepherd's Whistle",
  deck: 'E',
  number: 83,
  category: 'ANIMALS_',
  desc: ['At the start of the breeding phase of each harvest, if you have at least 1 unfenced stable without an animal, you get 1 <SHEEP>.'],
  cost: { wood: 1 },
})

export const E83_ShepherdsWhistle_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvestFeedingPhase: (_state, player) => {
    if (!hasEmptyUnfencedStable(player)) return
    return gainLeaf(CARD_ID, { sheep: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
