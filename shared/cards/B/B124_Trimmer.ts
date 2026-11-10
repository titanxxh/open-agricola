import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isCardFlagged, setCardFlag, writeCardExtraData } from '../helpers/card-state'
import { getActionNewlyEnclosedPastureTiles, hasFenceBuiltEvent } from '../helpers/fence-events'
import type { CardImpl } from '../registry'

const CARD_ID = 'B124_Trimmer'
/** Newly enclosed area belongs to the completed host, while the work-phase
 * limit and its reset remain on the card owner. */

const countPastureTiles = (player: CardListenerContext['player']): number =>
  player.pastures.reduce((sum, p) => sum + (p.tiles?.length ?? 0), 0)

const setStoredArea = (player: CardListenerContext['player'], area: number) =>
  writeCardExtraData(player, CARD_ID, 'pastureArea', area)

const specialEffect = (params: Record<string, unknown>): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params,
})

const afterFencingListener: CardListenerRegistration = {
  id: 'B124-trimmer-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!hasFenceBuiltEvent(context)) return
    if (isCardFlagged(context.player, CARD_ID)) return
    const currentArea = countPastureTiles(context.player)
    const newlyEnclosed = getActionNewlyEnclosedPastureTiles(context)
    const children: ActionFlow[] = [
      specialEffect({ kind: 'set-extra-data', key: 'pastureArea', value: currentArea }),
    ]
    if (newlyEnclosed.length > 0) {
      children.push(specialEffect({ kind: 'set-flag', flag: true }), gainLeaf(CARD_ID, { stone: 2 }))
    }
    return { flow: { type: 'seq', children }, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [afterFencingListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const area = countPastureTiles(player)
    setStoredArea(player, area)
    // If bought during work phase, unflag to allow triggering
    setCardFlag(player, CARD_ID, false)
  },
  onWorkStart: (_state, player) => {
    // Unflag at start of work phase to allow triggering
    return { type: 'seq', children: [
      specialEffect({ kind: 'set-flag', flag: false }),
      specialEffect({ kind: 'set-extra-data', key: 'pastureArea', value: countPastureTiles(player) }),
    ] }
  },
  onReturnHome: (_state, player) => {
    // Flag at return home to prevent triggering outside work phase
    setCardFlag(player, CARD_ID, true)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B124_Trimmer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Trimmer',
    deck: 'B',
    number: 124,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['In each work phase, after you enclose at least one farmyard space, you get 2 <STONE>. (Subdividing an existing pasture does not count.)'],
    cost: {},
    players: '1+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const B124_Trimmer_impl = B124_Trimmer.impl
