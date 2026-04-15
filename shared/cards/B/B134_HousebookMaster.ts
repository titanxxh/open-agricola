import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'B134_HousebookMaster'

// B134 Housebook Master: After playing this card, if you renovate to stone in round 13/12/11
// or before, you immediately get 1/2/3 food and 1/2/3 bonus score.
// BGA: isActionEvent($event, 'Renovation') && $event['newRoomType'] == 'roomStone'
// and turn <= 11 => n=3, turn == 12 => n=2, turn == 13 => n=1
const listener: CardListenerRegistration = {
  id: 'B134-housebook-master-after-renovation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    // Check that renovation was to stone
    if (context.player.houseType !== 'stone') return
    const round = context.state.round
    let n = 0
    if (round <= 11) {
      n = 3
    } else if (round === 12) {
      n = 2
    } else if (round === 13) {
      n = 1
    }
    if (n <= 0) return
    const bonusVpLeaves: ActionFlow[] = Array.from({ length: n }, () => ({
      type: 'leaf' as const,
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    }))
    return {
      flow: {
        type: 'seq',
        children: [
          gainLeaf(CARD_ID, { food: n }),
          ...bonusVpLeaves,
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const B134_HousebookMaster = new Occupation({
  id: CARD_ID,
  name: 'Housebook Master',
  deck: 'B',
  number: 134,
  category: 'POINTS_PROVIDER',
  desc: ['After playing this card, if you renovate to stone in round 13/12/11 or before, you immediately get 1/2/3 <FOOD> and 1/2/3 bonus <SCORE>.'],
  cost: {},
  players: '3+',
  newSet: true,
})
