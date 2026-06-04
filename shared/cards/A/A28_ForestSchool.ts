import { defineMinorCard } from '../card-source'
import type { TradeModifier } from '../../contract/types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../contract/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/effects/place-farmer'
import { isSpaceOccupied } from '../../domain/space'
import { isLessonsSpaceId } from '../helpers/lessons-spaces'
import type { CardImpl } from '../registry'

const CARD_ID = 'A28_ForestSchool'

const FOREST_SCHOOL_MAX_TRADES = 8
const lessonsComputeArgsListener: CardListenerRegistration = {
  id: 'A28-forest-school-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const extraOptions: ActionChoiceOption[] = context.state.actionSpaces
      .filter((space) =>
        isLessonsSpaceId(space.id) &&
        isSpaceOccupied(space) &&
        space.canBeExecutedByPlayer(context.state, context.player),
      )
      .map((space) => ({
        value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${space.id}`,
        labelKey: space.nameKey,
        sourceCard: CARD_ID,
      }))
    if (extraOptions.length === 0) return
    return { extraOptions, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [lessonsComputeArgsListener],
  modifiers: [{
    type: 'trade',
    cardId: CARD_ID,
    appliesTo: ['occupation'],
    from: { wood: 1 },
    to: { food: 1 },
    max: FOREST_SCHOOL_MAX_TRADES,
  } as TradeModifier],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A28_ForestSchool = defineMinorCard({
  meta: {
    id: "A28_ForestSchool",
    name: "Forest School",
    deck: "A",
    number: 28,
    category: "ACTIONS_BOOSTER",
    desc: ["You can consider the __Lessons__ action spaces not occupied. You can replace each <FOOD> that an occupation costs with <WOOD>."],
    cost: {"wood":1,"clay":1},
    vp: 1,
  },
  impl: cardImpl,
})

export const A28_ForestSchool_impl = A28_ForestSchool.impl
