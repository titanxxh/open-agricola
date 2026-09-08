import { defineOccupationCard } from '../card-source'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import { hasNoUnusedFarmyardSpaces } from '../../domain/farm'
import { hasInactiveWorkerInSupply } from '../../domain/player'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { supplyWorkerTurnFlow, consumeSupplyWorkerTurn } from '../helpers/supply-worker-flow'
import type { CardImpl } from '../registry'

const CARD_ID = 'E093_Motivator'

const cardImpl = {
  effect: {
  id: CARD_ID,
  extraTurnBeforeWorkers: true,
  onRoundStart: (_state, player) => { setCardFlag(player, CARD_ID, false) },
  contributeExtraTurn: (state, player) => {
    if (getRoundPlacementOrder(player).length !== 0 || isCardFlagged(player, CARD_ID)) return
    if (!hasNoUnusedFarmyardSpaces(player) || !hasInactiveWorkerInSupply(player)) return
    return supplyWorkerTurnFlow(state, player, CARD_ID, [consumeSupplyWorkerTurn(CARD_ID)])
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E093_Motivator = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Motivator',
    deck: 'E',
    number: 93,
    desc: ['On your first turn each round, if you have no unused farmyard spaces, you can place a person from your supply.'],
    cost: {},
    players: '1+',
    category: 'ACTION_-_GUEST',
  },
  impl: cardImpl,
})

export const E093_Motivator_impl = E093_Motivator.impl
