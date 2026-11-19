import type { GameState, PlayerState } from '../../../contract/types'
import { familySize } from '../../../domain/player'
import { defineOccupationCard } from '../../card-source'
import { grantGuestLeaf } from '../../helpers/guest-flow'
import { payThenActionFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CPI007_MarriageCounselor'

const qualifies = (state: GameState, player: PlayerState): boolean => {
  const ownSize = familySize(player)
  const otherSizes = state.players.filter(other => other.id !== player.id).map(familySize)
  return otherSizes.some(size => size >= ownSize + 2)
    || (otherSizes.length > 0 && otherSizes.every(size => size > ownSize))
}

export const CPI007_MarriageCounselor = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Marriage Counselor',
    deck: 'CPI',
    number: 7,
    desc: ['At the start of each round, if another player has at least 2 more family members than you, or if all other players have more family members than you, you may pay 1 <FOOD> to use 1 Guest this round.'],
    players: '4+',
  },
  impl: {
    effect: {
      id: CARD_ID,
      stageEligibility: { onRoundStart: qualifies },
      onRoundStart: (state, player, context) => {
        if (player.resources.food < 1 || (!context?.roundPreparation && !qualifies(state, player))) return
        return payThenActionFlow({ cardId: CARD_ID, cost: { food: 1 }, action: grantGuestLeaf(CARD_ID) }).flow
      },
    },
  },
})
