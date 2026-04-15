import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { writeCardInfobox } from '../helpers/card-state'

const CARD_ID = 'C87_Mason'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'hasRoom', true)
    writeCardInfobox(player, CARD_ID, '1 Stone Room')
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'C87-mason-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    const hasRoom = readCardExtraData<boolean>(context.player, CARD_ID, 'hasRoom')
    if (!hasRoom) return
    if (context.player.houseType !== 'stone') return
    if (context.player.rooms < 4) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'build-farmhand-room', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C87_Mason.anytime',
    }
  },
}
registerCardListener(anytimeListener)

export const C87_Mason = new Occupation({
  id: CARD_ID,
  name: 'Mason',
  deck: 'C',
  number: 87,
  category: 'FARM_PLANNER',
  desc: ['Place a stone room on this card. Once you have a stone house with at least 4 rooms, at any time, you can add that room without paying any building resources.'],
  cost: {},
  players: '1+',
  implemented: true,
})
