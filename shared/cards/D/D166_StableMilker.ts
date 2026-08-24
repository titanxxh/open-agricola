import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import {
  getStableTilesBuiltThisAction,
  readActionSnapshotToken,
} from '../helpers/action-snapshot'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D166_StableMilker'
const USED_ACTION_TOKEN_KEY = 'usedActionToken'

/**
 * D166 Stable Milker
 * Each time you build at least 2 stables on the same turn, you also get 1 cattle.
 *
 * Rule: tracks stables built per turn via numStablesBuiltThisTurn.
 * Uses setUsedOnTurnId / usableThisTurn to fire only once per turn.
 *
 * In open-agricola we use getStableTilesBuiltThisAction from action-snapshot
 * and track used action token so it fires only once per action.
 */

const tryGainCattle = (
  player: CardListenerContext['player'],
): ActionFlow | undefined => {
  const actionToken = readActionSnapshotToken(player)
  if (actionToken === undefined) return
  if (getStableTilesBuiltThisAction(player) < 2) return
  if (readCardExtraData<number>(player, CARD_ID, USED_ACTION_TOKEN_KEY) === actionToken) return

  return {
    type: 'seq',
    children: [
      {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-extra-data', key: USED_ACTION_TOKEN_KEY, value: actionToken },
      },
      gainLeaf(CARD_ID, { cattle: 1 }),
    ],
  }
}

const listener: CardListenerRegistration = {
  id: 'D166-stable-milker-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const flow = tryGainCattle(context.player)
    if (flow) return { flow, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const actionToken = readActionSnapshotToken(player)
    if (actionToken === undefined) return
    if (getStableTilesBuiltThisAction(player) < 2) return
    if (readCardExtraData<number>(player, CARD_ID, USED_ACTION_TOKEN_KEY) === actionToken) return
    writeCardExtraData(player, CARD_ID, USED_ACTION_TOKEN_KEY, actionToken)
    return gainLeaf(CARD_ID, { cattle: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D166_StableMilker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stable Milker',
    deck: 'D',
    number: 166,
    category: 'LIVESTOCK_PROVIDER',
    desc: [
        'Each time you build at least 2 <STABLE> on the same turn, you also get 1 <CATTLE>.',
      ],
    cost: {},
    players: '4+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const D166_StableMilker_impl = D166_StableMilker.impl
