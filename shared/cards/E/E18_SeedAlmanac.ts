import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E18_SeedAlmanac'

// E18 Seed Almanac: Each time after you play a minor improvement after this one,
// you can pay 1 FOOD to plow 1 field.
const listener: CardListenerRegistration = {
  id: 'E18-seed-almanac-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const choice = context.choice ?? ''
    // Only trigger for minor improvements, not this card itself
    if (choice.startsWith('major:')) return
    const builtId = choice.replace(/^minor:/, '')
    if (!builtId || builtId === CARD_ID) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const E18_SeedAlmanac = new MinorImprovement({
  id: CARD_ID,
  name: 'Seed Almanac',
  deck: 'E',
  number: 18,
  category: 'FARMYARD_PLOWING',
  desc: [
    'Each time after you play a minor improvement after this one, you can pay 1 <FOOD> to plow 1 field.',
  ],
  cost: { reed: 1 },
  prerequisite: '4 Occupations',
  occupationPrerequisites: { min: 4 },
})
