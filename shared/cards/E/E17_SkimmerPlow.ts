import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'E17_SkimmerPlow'

// Each time you use Farmland or Cultivation, can plow 2 fields instead of 1
// (optionally plow 1 additional field).
// Each time you sow, must place 1 fewer good on each field (handled via modifier - not implemented here).
const listener: CardListenerRegistration = {
  id: 'E17-skimmer-plow-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const spaceId = context.space?.id
    if (spaceId !== 'farmland' && spaceId !== 'cultivation') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const E17_SkimmerPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Skimmer Plow',
  deck: 'E',
  number: 17,
  category: 'FARM_PLANNER',
  desc: ['Each time you use the __Farmland__ or __Cultivation__ action space, you can plow 2 fields instead of 1. Each time you sow, you must place 1 fewer good on each field you sow.'],
  cost: { wood: 1 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
