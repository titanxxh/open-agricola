import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../game/types'

// Inline harvest rounds to avoid circular dependency with logic/state
const HARVEST_ROUNDS = [4, 7, 9, 11, 13, 14]

const CARD_ID = 'C84_PerennialRye'

const ANIMAL_TYPES = ['sheep', 'boar', 'cattle'] as const

registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
})

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
        { type: 'leaf' as const, actionId: 'flag-card', sourceCard: CARD_ID },
      ],
    }))

    return {
      flow: children.length === 1 ? children[0]! : { type: 'xor', children },
      sourceCard: CARD_ID,
      labelKey: 'cards.C84_PerennialRye.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const C84_PerennialRye = new MinorImprovement({
  id: CARD_ID,
  name: 'Perennial Rye',
  deck: 'C',
  number: 84,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each round that does not end with a harvest, you can pay 1 <GRAIN> to breed exactly 1 type of animal. (This is not considered a breeding phase.)'],
  cost: { food: 1 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  newSet: true,
})
