import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import { registerCardEffect } from '../card-effects'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'A129_Swagman'

/**
 * A129 Swagman:
 * Immediately after each time you use the Farm Expansion or Grain Seeds action space,
 * you can use the respective other space with the same person (even if it is occupied).
 *
 * BGA:
 * - afterPlaceFarmer on FarmExpansion → can optionally jump to GrainSeeds and execute it
 * - afterPlaceFarmer on GrainSeeds → can optionally jump to FarmExpansion and execute it
 * - Flag prevents repeated use per round
 *
 * Implementation: After place-farmer on one space, offer the other space's action flow
 * as an optional follow-up. The "jump" is conceptual — we just execute the other
 * space's action flow inline. Flag prevents re-trigger.
 */

const FARM_EXPANSION_ID = 'farm-expansion'
const GRAIN_SEEDS_ID = 'grain-seeds'

const buildGrainSeedsFlow = (): ActionFlow => gainLeaf(CARD_ID, { grain: 1 })

const buildFarmExpansionFlow = (): ActionFlow => ({
  type: 'or',
  children: [
    { type: 'leaf', actionId: 'construct', sourceCard: CARD_ID },
    { type: 'leaf', actionId: 'stables', sourceCard: CARD_ID },
  ],
})

const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'A129-swagman-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (isCardFlagged(context.player, CARD_ID)) return
    const spaceId = context.space?.id
    if (spaceId !== FARM_EXPANSION_ID && spaceId !== GRAIN_SEEDS_ID) return

    // Determine the other space's flow
    const otherFlow = spaceId === FARM_EXPANSION_ID
      ? buildGrainSeedsFlow()
      : buildFarmExpansionFlow()

    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [otherFlow],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(afterPlaceFarmerListener)

// Unflag at start of each round
registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (isCardFlagged(player, CARD_ID)) {
      setCardFlag(player, CARD_ID, false)
    }
  },
})

export const A129_Swagman = new Occupation({
  id: CARD_ID,
  name: 'Swagman',
  deck: 'A',
  number: 129,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Immediately after each time you use the __Farm Expansion__ or __Grain Seeds__ action space, you can use the respective other space with the same person (even if it is occupied).',
  ],
  cost: {},
  players: '3+',
  newSet: true,
})
