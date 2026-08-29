import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, PlayerState } from '../../contract/types'
import { isCardFlagged, readCardExtraData, setCardFlag } from '../helpers/card-state'
import {
  getRoomsBuiltThisAction,
  getStableTilesBuiltThisAction,
  getFencesBuiltThisAction,
  readActionSnapshotExtraData,
  readActionSnapshotToken,
} from '../helpers/action-snapshot'
import { hasOrdinaryFenceBuiltEvent } from '../helpers/fence-events'
import {
  isInjectedAnytimeActionContext,
  isInjectedAnytimeCompletionContext,
} from '../../engine/action-context-flags'
import type { CardImpl } from '../registry'

const CARD_ID = 'B027_Toolbox'
const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket']
const WINDOW_OFFERED_TURN_TOKEN_KEY = 'windowOfferedTurnToken'

const setFlagHandler = (context: CardListenerContext): ActionHookResult | void => {
  if (context.state.roundPhase !== 'work') return
  if (context.actionId === 'fence' && !hasOrdinaryFenceBuiltEvent(context)) return

  const activeTurnToken = readActionSnapshotToken(context.player)
  const completedTurnToken = readActionSnapshotExtraData<number>(context.player, 'lastToken')
  const turnToken = activeTurnToken ?? (
    isInjectedAnytimeActionContext(context.actionContext) ? completedTurnToken : undefined
  )
  if (
    turnToken !== undefined &&
    readCardExtraData<number>(context.player, CARD_ID, WINDOW_OFFERED_TURN_TOKEN_KEY) === turnToken
  ) return
  return {
    flow: {
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-flag', flag: true },
    },
    sourceCard: CARD_ID,
  }
}

const finishInjectedAnytimeHandler = (
  context: CardListenerContext,
): ActionHookResult | void => {
  if (context.state.roundPhase !== 'work') return
  if (!isInjectedAnytimeCompletionContext(context.actionContext)) return
  if (readActionSnapshotToken(context.player) !== undefined) return
  if (!isCardFlagged(context.player, CARD_ID)) return

  const turnToken = readActionSnapshotExtraData<number>(context.player, 'lastToken')
  if (turnToken === undefined) return
  if (readCardExtraData<number>(context.player, CARD_ID, WINDOW_OFFERED_TURN_TOKEN_KEY) === turnToken) return
  return {
    flow: makeWindowedToolboxFlow(turnToken, true),
    sourceCard: CARD_ID,
  }
}

const setFlagListeners: CardListenerRegistration[] = [
  { id: 'B27-flag-construct', cardIds: [CARD_ID], phases: ['after' as ActionHookPhase], actions: ['construct'],     handler: setFlagHandler },
  { id: 'B27-flag-stables',   cardIds: [CARD_ID], phases: ['after' as ActionHookPhase], actions: ['stables'],       handler: setFlagHandler },
  { id: 'B27-flag-fencing',   cardIds: [CARD_ID], phases: ['after' as ActionHookPhase], actions: ['fence'],         handler: setFlagHandler },
  { id: 'B27-window-after-injected-anytime', cardIds: [CARD_ID], phases: ['after' as ActionHookPhase], actions: ['special-effect'], handler: finishInjectedAnytimeHandler },
]

const builtSomethingThisAction = (player: PlayerState): boolean =>
  getRoomsBuiltThisAction(player) > 0 ||
  getStableTilesBuiltThisAction(player) > 0 ||
  getFencesBuiltThisAction(player) > 0

const makeToolboxFlow = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'improvement',
  optional: true,
  promptKey: 'ui.interactionToolboxImprovement',
  sourceCard: CARD_ID,
  params: { allowedPurchases: ALLOWED_MAJORS, trueAction: false },
  actionContext: { trueAction: false },
})

const makeWindowedToolboxFlow = (turnToken: number, clearFlag = false): ActionFlow => ({
  type: 'seq',
  children: [
    ...(clearFlag ? [{
      type: 'leaf' as const,
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-flag', flag: false },
    }] : []),
    {
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-extra-data', key: WINDOW_OFFERED_TURN_TOKEN_KEY, value: turnToken },
    },
    makeToolboxFlow(),
  ],
})

const cardImpl = {
  listeners: setFlagListeners,
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      if (state.roundPhase !== 'work') return
      setCardFlag(player, CARD_ID, builtSomethingThisAction(player))
    },
    onEndTurn: (_state, player) => {
      if (!isCardFlagged(player, CARD_ID)) return
      setCardFlag(player, CARD_ID, false)
      const turnToken = readActionSnapshotToken(player)
      return turnToken === undefined ? makeToolboxFlow() : makeWindowedToolboxFlow(turnToken)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B027_Toolbox = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Toolbox',
    deck: 'B',
    number: 27,
    category: 'ACTIONS_BOOSTER',
    desc: [
        "In the work phase, after each turn in which you build at least 1 room, <STABLE>, or <FENCE>, you can build the __Joinery__, __Pottery__, or __Basketmaker's Workshop__ major improvement.",
      ],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const B027_Toolbox_impl = B027_Toolbox.impl
