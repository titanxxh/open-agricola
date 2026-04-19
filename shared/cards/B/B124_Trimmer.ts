import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isCardFlagged, setCardFlag, writeCardExtraData, readCardExtraData } from '../helpers/card-state'

const CARD_ID = 'B124_Trimmer'

/**
 * B124 Trimmer:
 * In each work phase, after you enclose at least one farmyard space, you get 2 stone.
 * (Subdividing an existing pasture does not count.)
 *
 * BGA:
 * - onBuy: record current fencing area (pasture-covered zones).
 *          If during work phase, also unflag.
 * - startOfWork: unflag
 * - returnHome: flag (prevent triggering outside work phase)
 * - afterFencing: check if covered zones increased → 2 stone. Update stored area.
 *
 * Implementation:
 * - We track pasture-covered tile count in extraData.
 * - onBeforeStartOfTurn: unflag (start of work phase)
 * - onReturnHome: flag (prevent triggering)
 * - afterFencing: if total pasture tile count increased → 2 stone. Update count.
 */

const countPastureTiles = (player: CardListenerContext['player']): number =>
  player.pastures.reduce((sum, p) => sum + (p.tiles?.length ?? 0), 0)

const getStoredArea = (player: CardListenerContext['player']): number =>
  readCardExtraData<number>(player, CARD_ID, 'pastureArea') ?? 0

const setStoredArea = (player: CardListenerContext['player'], area: number) =>
  writeCardExtraData(player, CARD_ID, 'pastureArea', area)

// After fencing: check if pasture area increased
const afterFencingListener: CardListenerRegistration = {
  id: 'B124-trimmer-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fencing'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    const currentArea = countPastureTiles(context.player)
    const storedArea = getStoredArea(context.player)
    // Update stored area regardless
    setStoredArea(context.player, currentArea)
    // Flag to prevent multiple triggers per work phase
    setCardFlag(context.player, CARD_ID, true)
    if (currentArea > storedArea) {
      return { flow: gainLeaf(CARD_ID, { stone: 2 }), sourceCard: CARD_ID }
    }
  },
}

registerCardListener(afterFencingListener)

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const area = countPastureTiles(player)
    setStoredArea(player, area)
    // If bought during work phase, unflag to allow triggering
    setCardFlag(player, CARD_ID, false)
  },
  onBeforeStartOfTurn: (_state, player) => {
    // Unflag at start of work phase to allow triggering
    setCardFlag(player, CARD_ID, false)
    // Update stored area for comparison
    setStoredArea(player, countPastureTiles(player))
  },
  onReturnHome: (_state, player) => {
    // Flag at return home to prevent triggering outside work phase
    setCardFlag(player, CARD_ID, true)
  },
})

export const B124_Trimmer = new Occupation({
  id: CARD_ID,
  name: 'Trimmer',
  deck: 'B',
  number: 124,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['In each work phase, after you enclose at least one farmyard space, you get 2 <STONE>. (Subdividing an existing pasture does not count.)'],
  cost: {},
  players: '1+',
  evenMoreSet: true,
})
