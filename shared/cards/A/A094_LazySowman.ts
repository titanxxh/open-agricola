import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption, ActionSpace, GameState } from '../../contract/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/helpers/placement-constants'
import { canSow, isUnconditionalSow } from '../../actions/effects/sow'
import { isSpaceOccupied } from '../../domain/space'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'
import { readActionSnapshotToken } from '../helpers/action-snapshot'

const CARD_ID = 'A094_LazySowman'
const isMeetingPlace = (space: ActionSpace) => space.id === 'meeting-place'
const isOwnersActiveWorkTurn = (context: CardListenerContext) =>
  context.state.roundPhase === 'work' && readActionSnapshotToken(context.player) !== undefined
const isOwnersWorkTurnPreview = (context: CardListenerContext) =>
  isOwnersActiveWorkTurn(context) || (
    context.state.roundPhase === 'work' &&
    context.state.players[context.state.currentPlayerIndex]?.id === context.player.id
  )

const getOpenRound = (state: GameState, space: ActionSpace) => {
  const roundIndex = state.roundActionOrder.findIndex((spaceId) => spaceId === space.id)
  return roundIndex === -1 ? space.roundAvailable : roundIndex + 1
}

const isOpenSpace = (state: GameState, space: ActionSpace) => {
  return state.round >= getOpenRound(state, space)
}

const computeReplaceListener: CardListenerRegistration = {
  id: 'A94-lazy-sowman-replace-sow',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isOwnersActiveWorkTurn(context)) return
    if (context.actionContext?.checkedReplaceAction === true) return
    if (!isUnconditionalSow(context.actionContext)) return
    if (workersAvailable(context.state, context.player) <= 0) return
    return {
      decline: true,
      alternativeFlow: {
        type: 'seq',
        optional: true,
        promptKey: 'ui.interactionLazySowmanPlace',
        choiceLabelKey: 'ui.interactionUseCard',
        choiceLabelParams: {
          cardNameKey: 'occupations.A094_LazySowman.name',
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
    if (!isOwnersWorkTurnPreview(context)) return
    if (context.actionContext?.checkedReplaceAction === true) return
    if (!isUnconditionalSow(context.actionContext)) return
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

const cardImpl = {
  listeners: [computeReplaceListener, isDoableListener, computeArgsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A094_LazySowman = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Lazy Sowman",
    deck: "A",
    number: 94,
    category: "ACTIONS_BOOSTER",
    desc: ["Each time you decline an unconditional __Sow__ action on your turn, you can immediately place another person on an action space of your choice (even if it is occupied)."],
    rules: ["The additional person cannot be placed on __Meeting Place__."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const A094_LazySowman_impl = A094_LazySowman.impl
