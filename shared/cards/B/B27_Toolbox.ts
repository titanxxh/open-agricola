import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, PlayerState } from '../../contract/types'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import {
  getRoomsBuiltThisAction,
  getStableTilesBuiltThisAction,
  getFencesBuiltThisAction,
} from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'
import { B27_Toolbox } from '../../cards-display/B/B27_Toolbox'

const CARD_ID = B27_Toolbox.id

const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket']

const setFlagHandler = (context: CardListenerContext): ActionHookResult | void => {
  if (context.state.roundPhase !== 'work') return
  setCardFlag(context.player, CARD_ID, true)
}

const setFlagListeners: CardListenerRegistration[] = [
  { id: 'B27-flag-construct', cardIds: [CARD_ID], phases: ['after' as ActionHookPhase], actions: ['construct'],     handler: setFlagHandler },
  { id: 'B27-flag-stables',   cardIds: [CARD_ID], phases: ['after' as ActionHookPhase], actions: ['stables'],       handler: setFlagHandler },
  { id: 'B27-flag-fencing',   cardIds: [CARD_ID], phases: ['after' as ActionHookPhase], actions: ['fence'],         handler: setFlagHandler },
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

export const B27_Toolbox_impl = {
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
      return makeToolboxFlow()
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
