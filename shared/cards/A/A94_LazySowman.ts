import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption, ActionSpace, GameState } from '../../contract/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/helpers/placement-constants'
import { canSow } from '../../actions/effects/sow'
import { isSpaceOccupied } from '../../domain/space'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'
import { A94_LazySowman } from '../../cards-display/A/A94_LazySowman'

const CARD_ID = A94_LazySowman.id

const isMeetingPlace = (space: ActionSpace) => space.id === 'meeting-place'

const getOpenRound = (state: GameState, space: ActionSpace) => {
  const roundIndex = state.roundActionOrder.findIndex((spaceId) => spaceId === space.id)
  return roundIndex === -1 ? space.roundAvailable : roundIndex + 1
}

const isOpenSpace = (state: GameState, space: ActionSpace) => {
  return state.round >= getOpenRound(state, space)
}

const isUnconditionalSow = (context: CardListenerContext) => {
  const actionContext = context.actionContext ?? {}
  if (actionContext.checkedReplaceAction === true) return false
  return actionContext.maxSelections === undefined && actionContext.cropType === undefined
}

const computeReplaceListener: CardListenerRegistration = {
  id: 'A94-lazy-sowman-replace-sow',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.roundPhase !== 'work') return
    if (!isUnconditionalSow(context)) return
    if (workersAvailable(context.state, context.player) <= 0) return
    return {
      decline: true,
      alternativeFlow: {
        type: 'seq',
        optional: true,
        promptKey: 'ui.interactionLazySowmanPlace',
        choiceLabelKey: 'ui.interactionUseCard',
        choiceLabelParams: {
          cardNameKey: 'occupations.A94_LazySowman.name',
        },
        children: [
          { type: 'leaf', actionId: 'place-farmer', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'A94-lazy-sowman-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.roundPhase !== 'work') return
    if (!isUnconditionalSow(context)) return
    if (canSow(context.player)) return
    if (workersAvailable(context.state, context.player) <= 0) return
    return { doable: true }
  },
}

const computeArgsListener: CardListenerRegistration = {
  id: 'A94-lazy-sowman-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.result?.type !== 'request' || context.result.request.kind !== 'choice') return
    if (context.sourceCard !== CARD_ID) return
    const extraOptions: ActionChoiceOption[] = context.state.actionSpaces
      .filter((space) =>
        isOpenSpace(context.state, space) &&
        !isMeetingPlace(space) &&
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

export const A94_LazySowman_impl = {
  listeners: [computeReplaceListener, isDoableListener, computeArgsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
