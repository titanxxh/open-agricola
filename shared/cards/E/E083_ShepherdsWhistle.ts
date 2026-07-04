import { defineMinorCard } from '../card-source'
import { playerBoard } from '../../domain'
import { gainLeaf } from '../helpers/pay-gain-node'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { ActionDefinition, ActionFlow, GameState, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E083_ShepherdsWhistle'
const POST_REORG_CHECK_ACTION_ID = 'card_E083_ShepherdsWhistle_post-reorg-check'

/**
 * E83 Shepherd's Whistle — At the start of the breeding phase of each harvest,
 * if you have at least 1 unfenced stable without an animal, you get 1 sheep.
 *
 * BGA reference: onPlayerEndHarvestFeedingPhase
 *   - If an empty unfenced stable already exists → gain 1 sheep.
 *   - Else if at least 1 (occupied) unfenced stable exists → optional
 *     reorganize, then re-check; if a stable became empty, gain 1 sheep.
 */

const hasEmptyUnfencedStable = (state: GameState, player: PlayerState): boolean => {
  const idx = state.players.indexOf(player)
  const looseStableKeys = playerBoard(state, idx).animals.looseStableKeys()
  return looseStableKeys.some((key) => !player.stableAnimals?.[key])
}

const hasAnyUnfencedStable = (state: GameState, player: PlayerState): boolean => {
  const idx = state.players.indexOf(player)
  return playerBoard(state, idx).animals.looseStableKeys().length > 0
}

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
  execute: ({ state, player }) => {
    if (!hasEmptyUnfencedStable(state, player)) return { type: 'ok' }
    return { type: 'flow', flow: gainLeaf(CARD_ID, { sheep: 1 }) }
  },
}

registerAdHocAction(postReorgCheckAction)

const cardImpl = {
  effect: {
  id: CARD_ID,
  onEndHarvestFeedingPhase: (state, player): ActionFlow | undefined => {
    if (hasEmptyUnfencedStable(state, player)) {
      return gainLeaf(CARD_ID, { sheep: 1 })
    }
    if (hasAnyUnfencedStable(state, player)) {
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

export const E083_ShepherdsWhistle = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Shepherd's Whistle",
    deck: 'E',
    number: 83,
    category: 'ANIMALS_',
    desc: ['At the start of the breeding phase of each harvest, if you have at least 1 unfenced <STABLE> without an animal, you get 1 <SHEEP>.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const E083_ShepherdsWhistle_impl = E083_ShepherdsWhistle.impl
