import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../contract/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/effects/place-farmer'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'
import { A28_ForestSchool } from '../../cards-display/A/A28_ForestSchool'

const CARD_ID = A28_ForestSchool.id

const LESSONS_SPACE_IDS = ['lessons', 'lessons-4']

const lessonsComputeArgsListener: CardListenerRegistration = {
  id: 'A28-forest-school-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const extraOptions: ActionChoiceOption[] = context.state.actionSpaces
      .filter((space) =>
        LESSONS_SPACE_IDS.includes(space.id) &&
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

export const A28_ForestSchool_impl = {
  listeners: [lessonsComputeArgsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
