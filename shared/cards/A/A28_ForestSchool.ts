import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption, TradeModifier } from '../../game/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/effects/placement-constants'
import { isSpaceOccupied } from '../../game/space'

const CARD_ID = 'A28_ForestSchool'
const FOREST_SCHOOL_MAX_TRADES = 8
const LESSONS_SPACE_IDS = ['lessons', 'lessons-4']

const lessonsComputeArgsListener: CardListenerRegistration = {
  id: 'A28-forest-school-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const extraOptions: ActionChoiceOption[] = context.state.actionSpaces
      .filter((space) =>
        LESSONS_SPACE_IDS.includes(space.id) &&
        isSpaceOccupied(space) &&
        space.canBeExecutedByPlayer(context.state, context.player),
      )
      .map((space) => ({
        value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${space.id}`,
        labelKey: space.nameKey,
      }))
    if (extraOptions.length === 0) return
    return { extraOptions, sourceCard: CARD_ID }
  },
}

registerCardListener(lessonsComputeArgsListener)

export const A28_ForestSchool = new MinorImprovement({
  id: "A28_ForestSchool",
  name: "Forest School",
  deck: "A",
  number: 28,
  category: "ACTIONS_BOOSTER",
  desc: ["You can consider the __Lessons__ action spaces not occupied. You can replace each <FOOD> that an occupation costs with <WOOD>."],
  cost: {"wood":1,"clay":1},
  vp: 1,
  newSet: true,
  modifier: {
    type: 'trade',
    cardId: CARD_ID,
    appliesTo: ['occupation'],
    from: { wood: 1 },
    to: { food: 1 },
    max: FOREST_SCHOOL_MAX_TRADES,
  } as TradeModifier,
})
