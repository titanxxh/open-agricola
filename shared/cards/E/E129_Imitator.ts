import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../contract/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/helpers/placement-constants'
import { isSpaceOccupied, spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'
import { E129_Imitator } from '../../cards-display/E/E129_Imitator'
export { E129_Imitator }

const CARD_ID = E129_Imitator.id

/**
 * E129 Imitator — If you have a person on the __Day Laborer__ action space,
 * you can use non-accumulating round 1-9 action spaces even if they are occupied.
 *
 * BGA: adds occupied non-accumulating round 1–9 spaces to computeArgsPlaceFarmer.
 * The non-accumulating spaces available from round 1-9 are:
 * grain-utilization, fencing, major-improvement, wish-children,
 * house-redevelopment, vegetable-seeds.
 *
 * Players: 3+.
 */
const NON_ACCUMULATING_ROUND_1_9_SPACES = new Set([
  'grain-utilization',
  'fencing',
  'major-improvement',
  'wish-children',
  'house-redevelopment',
  'vegetable-seeds',
])

const computeArgsListener: CardListenerRegistration = {
  id: 'E129-imitator-compute-args',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Must have a person on Day Laborer
    const dayLaborerSpace = context.state.actionSpaces.find((s) => s.id === 'day-laborer')
    if (!dayLaborerSpace || !spaceHasPlayer(dayLaborerSpace, context.player.id)) return
    // Find occupied non-accumulating round 1–9 spaces
    const extraOptions: ActionChoiceOption[] = context.state.actionSpaces
      .filter((s) => {
        if (!NON_ACCUMULATING_ROUND_1_9_SPACES.has(s.id)) return false
        if (!isSpaceOccupied(s)) return false // free spaces already selectable
        if (s.roundAvailable > 9) return false
        return true
      })
      .map((s) => ({
        value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${s.id}`,
        labelKey: s.nameKey,
        sourceCard: CARD_ID,
      }))
    if (extraOptions.length === 0) return
    return { extraOptions, sourceCard: CARD_ID }
  },
}

export const E129_Imitator_impl = {
  listeners: [computeArgsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
