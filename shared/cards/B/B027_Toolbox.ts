import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { compileRuleBody } from '../../actions/timed-rules'
import type { RuleBody } from '../../contract/rule-plans'
import type { ActionFlow, PlayerState } from '../../contract/types'
import { isCardFlagged, readCardExtraData, setCardFlag } from '../helpers/card-state'
import {
  getRoomsBuiltThisAction,
  getStableTilesBuiltThisAction,
  getFencesBuiltThisAction,
} from '../helpers/action-snapshot'
import { hasOrdinaryFenceBuiltEvent } from '../helpers/fence-events'
import { createEventQuery } from '../../events/query'
import { readAnytimeTurn } from '../../engine/action-context-flags'
import type { CardImpl } from '../registry'
import { readTurnScopeToken } from '../helpers/turn-token'

const CARD_ID = 'B027_Toolbox'
const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket']
const WINDOW_OFFERED_TURN_TOKEN_KEY = 'windowOfferedTurnToken'

const setFlagHandler = (context: CardListenerContext): ActionHookResult | void => {
  if (context.state.roundPhase !== 'work') return
  if (context.actionId === 'fence' && !hasOrdinaryFenceBuiltEvent(context)) return

  const affiliation = readAnytimeTurn(context.actionContext)
  const turnToken = affiliation
    ? ('token' in affiliation ? affiliation.token : undefined)
    : readTurnScopeToken(context.player)
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

const finishAnytimeHandler = (
  context: CardListenerContext,
): ActionHookResult | void => {
  if (context.state.roundPhase !== 'work') return
  const completion = createEventQuery(context.actionEvents ?? []).find('anytime.completed', event => event.actorPlayerId === context.player.id)
  if (completion?.turn.kind !== 'after-turn' || completion.parentActivationId !== undefined) return
  if (!isCardFlagged(context.player, CARD_ID)) return
  const turnToken = completion.turn.token
  if (readCardExtraData<number>(context.player, CARD_ID, WINDOW_OFFERED_TURN_TOKEN_KEY) === turnToken) {
    return {
      flow: { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: false } },
      sourceCard: CARD_ID,
    }
  }
  return {
    flow: makeWindowedToolboxFlow(turnToken, true),
    sourceCard: CARD_ID,
  }
}

const setFlagListeners: CardListenerRegistration[] = [
  { id: 'B27-flag-construct', cardIds: [CARD_ID], phases: ['after' as ActionHookPhase], actions: ['construct'],     handler: setFlagHandler },
  { id: 'B27-flag-stables',   cardIds: [CARD_ID], phases: ['after' as ActionHookPhase], actions: ['stables'],       handler: setFlagHandler },
  { id: 'B27-flag-fencing',   cardIds: [CARD_ID], phases: ['after' as ActionHookPhase], actions: ['fence'],         handler: setFlagHandler },
  { id: 'B27-window-after-anytime-completed', cardIds: [CARD_ID], phases: ['after'], events: ['anytime.completed'], handler: finishAnytimeHandler },
]

const builtSomethingThisAction = (player: PlayerState): boolean =>
  getRoomsBuiltThisAction(player) > 0 ||
  getStableTilesBuiltThisAction(player) > 0 ||
  getFencesBuiltThisAction(player) > 0

const toolboxBody = {
  kind: 'optional', promptKey: 'ui.interactionToolboxImprovement', body: { kind: 'action', actionId: 'improvement', params: { allowedPurchases: ALLOWED_MAJORS, trueAction: false }, policy: { trueAction: false } },
} satisfies RuleBody
const makeToolboxFlow = (): ActionFlow => compileRuleBody(CARD_ID, 'toolbox-window', toolboxBody)

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
    timedRules: [{ retainAfterCardLeaves: true, key: 'toolbox-window', at: { kind: 'card-flag', clock: 'current-turn', phase: 'onEndTurn' }, consume: { clearCardFlag: true, recordTurnFact: WINDOW_OFFERED_TURN_TOKEN_KEY }, body: toolboxBody }],
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
