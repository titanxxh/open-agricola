import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { writeCardInfobox } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'C087_Mason'
const FREE_SINGLE_ROOM_CONTEXT = {
  maxRooms: 1,
  exactCost: { max: 1 },
  trueAction: false,
  cancelPolicy: 'forbidCancel',
}

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
          {
            type: 'leaf',
            actionId: 'construct',
            sourceCard: CARD_ID,
            actionContext: FREE_SINGLE_ROOM_CONTEXT,
          },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C087_Mason.anytime',
    }
  },
}

const cardImpl = {
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

export const C087_Mason = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Mason',
    deck: 'C',
    number: 87,
    category: 'FARM_PLANNER',
    desc: ['Place a stone room on this card. Once you have a stone house with at least 4 rooms, at any time, you can add that room without paying any building resources.'],
    cost: {},
    players: '1+',
    implemented: true,
  },
  impl: cardImpl,
})

export const C087_Mason_impl = C087_Mason.impl
