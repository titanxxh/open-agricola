import { MinorImprovement } from '../types'
import { getLooseStableKeys } from '../../actions/helpers/animal-zones'
import { gainLeaf } from '../helpers/pay-gain-node'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { ActionDefinition, ActionFlow, PlayerState } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E83_ShepherdsWhistle'
const POST_REORG_CHECK_ACTION_ID = 'card_E83_ShepherdsWhistle_post-reorg-check'

/**
 * E83 Shepherd's Whistle — At the start of the breeding phase of each harvest,
 * if you have at least 1 unfenced stable without an animal, you get 1 sheep.
 *
 * BGA reference: onPlayerEndHarvestFeedingPhase
 *   - If an empty unfenced stable already exists → gain 1 sheep.
 *   - Else if at least 1 (occupied) unfenced stable exists → optional
 *     reorganize, then re-check; if a stable became empty, gain 1 sheep.
 */

const hasEmptyUnfencedStable = (player: PlayerState): boolean => {
  const looseStableKeys = getLooseStableKeys(player)
  return looseStableKeys.some((key) => !player.stableAnimals?.[key])
}

const hasAnyUnfencedStable = (player: PlayerState): boolean =>
  getLooseStableKeys(player).length > 0

/**
 * Post-reorganize check leaf: after the optional reorganize, if a
 * previously-occupied unfenced stable was vacated, the owner gains 1 sheep.
 * Mirrors BGA `checkGainSheep()` (Engine::insertAsChild a gainNode).
 */
const postReorgCheckAction: ActionDefinition = {
  id: POST_REORG_CHECK_ACTION_ID,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    if (!hasEmptyUnfencedStable(player)) return { type: 'ok' }
    return { type: 'flow', flow: gainLeaf(CARD_ID, { sheep: 1 }) }
  },
}
registerAdHocAction(postReorgCheckAction)

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
  onEndHarvestFeedingPhase: (_state, player): ActionFlow | undefined => {
    if (hasEmptyUnfencedStable(player)) {
      return gainLeaf(CARD_ID, { sheep: 1 })
    }
    if (hasAnyUnfencedStable(player)) {
      return {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'anytime-reorg',
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: POST_REORG_CHECK_ACTION_ID,
            sourceCard: CARD_ID,
          },
        ],
      }
    }
    return undefined
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
