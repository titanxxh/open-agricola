import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { C84_PerennialRye } from '../../cards-display/C/C84_PerennialRye'
export { C84_PerennialRye }

const CARD_ID = C84_PerennialRye.id

const HARVEST_ROUNDS = [4, 7, 9, 11, 13, 14]

const ANIMAL_TYPES = ['sheep', 'boar', 'cattle'] as const

const anytimeListener: CardListenerRegistration = {
  id: 'C84-perennial-rye-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.grain < 1) return
    if (HARVEST_ROUNDS.includes(context.state.round)) return

    const breedableTypes = ANIMAL_TYPES.filter(type => context.player.resources[type] >= 2)
    if (breedableTypes.length === 0) return

    const children: ActionFlow[] = breedableTypes.map(type => ({
      type: 'seq' as const,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
        gainLeaf(CARD_ID, { [type]: 1 }),
        { type: 'leaf' as const, actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
      ],
    }))

    return {
      flow: children.length === 1 ? children[0]! : { type: 'xor', children },
      sourceCard: CARD_ID,
      labelKey: 'cards.C84_PerennialRye.anytime',
    }
  },
}

export const C84_PerennialRye_impl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
