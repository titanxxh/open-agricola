import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, PlayerState } from '../../game/types'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import {
  getRoomsBuiltThisAction,
  getStableTilesBuiltThisAction,
  getFencesBuiltThisAction,
} from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'

const CARD_ID = 'B27_Toolbox'
const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket']

const setFlagHandler = (context: CardListenerContext): ActionHookResult | void => {
  if (context.state.roundPhase !== 'work') return
  setCardFlag(context.player, CARD_ID, true)
}

const setFlagListeners: CardListenerRegistration[] = [
  { id: 'B27-flag-construct', cardIds: [CARD_ID], phases: ['after' as ActionHookPhase], actions: ['construct'],     handler: setFlagHandler },
  { id: 'B27-flag-stables',   cardIds: [CARD_ID], phases: ['after' as ActionHookPhase], actions: ['stables'],       handler: setFlagHandler },
  { id: 'B27-flag-fencing',   cardIds: [CARD_ID], phases: ['after' as ActionHookPhase], actions: ['fencing'],       handler: setFlagHandler },
]

const builtSomethingThisAction = (player: PlayerState): boolean =>
  getRoomsBuiltThisAction(player) > 0 ||
  getStableTilesBuiltThisAction(player) > 0 ||
  getFencesBuiltThisAction(player) > 0

const makeToolboxFlow = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'improvement-any',
  optional: true,
  promptKey: 'ui.interactionToolboxImprovement',
  sourceCard: CARD_ID,
  actionContext: { allowedPurchases: ALLOWED_MAJORS },
})

export const B27_Toolbox = new MinorImprovement({
  id: CARD_ID,
  name: 'Toolbox',
  deck: 'B',
  number: 27,
  category: 'ACTIONS_BOOSTER',
  desc: [
    "In the work phase, after each turn in which you build at least 1 room, stable, or fence, you can build the __Joinery__, __Pottery__, or __Basketmaker's Workshop__ major improvement.",
  ],
  cost: { wood: 1 },
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
