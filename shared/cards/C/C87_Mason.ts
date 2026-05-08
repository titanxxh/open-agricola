import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { writeCardInfobox } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { C87_Mason } from '../../cards-display/C/C87_Mason'
export { C87_Mason }

const CARD_ID = C87_Mason.id

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
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C87_Mason.anytime',
    }
  },
}

export const C87_Mason_impl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'hasRoom', true)
    writeCardInfobox(player, CARD_ID, '1 Stone Room')
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
