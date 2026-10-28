import { getReapedCropAmount } from '../../actions/helpers/reap-listener'
import { defineOccupationCard } from '../card-source'
import {
  readCardExtraData,
} from '../helpers/card-state'
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import { isMoorBalanceRulesEnabled } from '../../contract/game-variants'
import { hasNoUnusedFarmyardSpaces } from '../../domain/farmyard-usage'
import type { CardImpl } from '../registry'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import { getActionFarmOperations, getActionNewlyUsedTiles, getActionTerrainOperations } from '../helpers/farmyard-events'

const CARD_ID = 'B132_EstateMaster'

const isFarmSaturated = (player: PlayerState, state?: GameState): boolean =>
  hasNoUnusedFarmyardSpaces(player)
  && (!isMoorBalanceRulesEnabled(state) || (player.farmTerrain?.length ?? 0) === 0)

const isSaturatedFlagged = (player: PlayerState): boolean =>
  readCardExtraData<boolean>(player, CARD_ID, 'saturated') === true

const specialEffect = (params: Record<string, unknown>): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params,
})

const isSaturatedAfterAction = (context: CardListenerContext): boolean => {
  const operations = getActionFarmOperations(context)
  if (operations === undefined) return isFarmSaturated(context.player, context.state)
  return operations.some(operation => operation.playerId === context.player.id && isFarmSaturated({
    ...context.player,
    ...operation.after,
    farmTerrain: operation.after.farmTerrain ?? [],
    farmyardExtensions: operation.after.farmyardExtensions ?? [],
    farmyardSpaceStates: operation.after.farmyardSpaceStates ?? [],
  }, context.state))
}

const saturationEventListener: CardListenerRegistration = {
  id: 'B132-saturate-after-farm-change',
  cardIds: [CARD_ID],
  events: ['farm.spacesUsed', 'farm.terrainChanged'],
  phases: ['after'],
  scope: 'player',
  handler: context => {
    if (isSaturatedFlagged(context.player) || !isSaturatedAfterAction(context)) return
    const changed = getActionNewlyUsedTiles(context).length > 0 || getActionTerrainOperations(context)
      .some(event => event.playerId === context.player.id && event.changes.length > 0)
    if (!changed) return
    return {
      sourceCard: CARD_ID,
      flow: specialEffect({ kind: 'set-extra-data', key: 'saturated', value: true }),
    }
  },
}

const reapListener: CardListenerRegistration = {
  id: 'B132-estate-master-reap',
  cardIds: [CARD_ID],
  actions: ['reap'],
  phases: ['after'],
  handler: (ctx) => {
    const player = ctx.player
    const amount = getReapedCropAmount(ctx, 'vegetable')
    if (amount <= 0) return
    if (!isSaturatedFlagged(player) && !isFarmSaturated(player, ctx.state)) return
    return {
      flow: specialEffect({ kind: 'increment-counter', key: 'bonusVp', amount }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [
    saturationEventListener,
    reapListener,
  ],
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => isFarmSaturated(player, state)
      ? specialEffect({ kind: 'set-extra-data', key: 'saturated', value: true }) : undefined,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B132_EstateMaster = defineOccupationCard({
  presentation: { counters: ['bonusVp'] },
  meta: {
    id: CARD_ID,
    name: 'Estate Master',
    deck: 'B',
    number: 132,
    category: 'POINTS_PROVIDER',
    desc: ['Once you have no unused farmyard spaces left, you get 1 bonus <SCORE> for each <VEGETABLE> that you harvest.'],
    cost: {},
    players: '3+',
    extraVp: true,
  },
  impl: cardImpl,
})

export const B132_EstateMaster_impl = B132_EstateMaster.impl
