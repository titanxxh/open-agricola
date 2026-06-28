import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { computeAllowedPlacementSpaces } from '../../actions/helpers/placement-availability'
import { isCardFlagged } from '../helpers/card-state'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'B024_Lasso'
const MARKET_SPACES = ['sheep-market', 'pig-market', 'cattle-market']

const listener: CardListenerRegistration = {
  id: 'B24-lasso-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (workersAvailable(context.state, context.player) <= 0) return
    const usedMarket = MARKET_SPACES.includes(context.space?.id ?? '')
    const allowed = computeAllowedPlacementSpaces(context.state, context.player, { sourceCard: CARD_ID })
    const constraints = usedMarket
      ? allowed.map((placement) => placement.spaceId)
      : allowed
        .filter((placement) => MARKET_SPACES.includes(placement.spaceId))
        .map((placement) => placement.spaceId)
    if (constraints.length === 0) return
    const placeFarmer: Extract<ActionFlow, { type: 'leaf' }> = {
      type: 'leaf',
      actionId: 'place-farmer',
      sourceCard: CARD_ID,
      actionContext: { constraints },
    }
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          placeFarmer,
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: false } },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B024_Lasso = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Lasso',
    deck: 'B',
    number: 24,
    category: 'ACTIONS_BOOSTER',
    desc: ['You can place exactly two people immediately after one another if at least one of them uses the __Sheep Market__, __Pig Market__, or __Cattle Market__ accumulation space.'],
    cost: { reed: 1 },
  },
  impl: cardImpl,
})

export const B024_Lasso_impl = B024_Lasso.impl
