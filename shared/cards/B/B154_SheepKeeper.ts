import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { B154_SheepKeeper } from '../../cards-display/B/B154_SheepKeeper'

const CARD_ID = B154_SheepKeeper.id

registerPrerequisite('Less Than 7 Sheep', (player) => player.resources.sheep < 7)

const anytimeListener: CardListenerRegistration = {
  id: 'B154-sheep-keeper-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.sheep < 7) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          gainLeaf(CARD_ID, { food: 2 }),
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.B154_SheepKeeper.anytime',
    }
  },
}

export const B154_SheepKeeper_impl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
