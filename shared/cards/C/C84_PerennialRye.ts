import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C84_PerennialRye'
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

const cardImpl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C84_PerennialRye = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Perennial Rye',
    deck: 'C',
    number: 84,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each round that does not end with a harvest, you can pay 1 <GRAIN> to breed exactly 1 type of animal. (This is not considered a breeding phase.)'],
    cost: { food: 1 },
    prerequisite: '2 Occupations',
    occupationPrerequisites: { min: 2 },
  },
  impl: cardImpl,
})

export const C84_PerennialRye_impl = C84_PerennialRye.impl
