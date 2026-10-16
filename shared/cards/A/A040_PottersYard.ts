import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration } from '../card-listeners'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { countUnusedFarmyardSpaces, getFarmyardTilePositions, positionKey } from '../../domain/farm'
import { getUsedFarmyardTileKeys } from '../../domain/farmyard-usage'
import { addFarmyardSpaceState, getFarmyardSpaceStates } from '../../domain/farmyard-space-states'
import { hasClaimableFarmyardGoodsTokens } from '../../domain/farmyard-space-token-claims'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import { getActionNewlyUsedTiles } from '../helpers/farmyard-events'
import { sumResourceMovedToPlayer } from '../helpers/event-provenance'
import type { ActionFlow, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A040_PottersYard'
const PLACE_CLAY = 'card_A040_PottersYard_placeClay'
const remainingClay = (player: PlayerState) => getFarmyardSpaceStates(player)
  .filter(token => token.sourceCardId === CARD_ID && token.kind === 'farmyard-goods-token')
  .reduce((sum, token) => sum + (token.resources?.clay ?? 0), 0)

registerAdHocAction({
  id: PLACE_CLAY,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, eventSink }) => {
    const used = getUsedFarmyardTileKeys(player)
    for (const tile of getFarmyardTilePositions(player)) {
      if (used.has(positionKey(tile))) continue
      addFarmyardSpaceState(player, {
        spaceKey: positionKey(tile), sourceCardId: CARD_ID, kind: 'farmyard-goods-token',
        resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused',
      }, eventSink)
    }
    return { type: 'ok' }
  },
})

const collect: CardListenerRegistration = {
  id: 'A40-potters-yard-collect',
  cardIds: [CARD_ID],
  phases: ['after'],
  handler: context => {
    if (!context.triggerSnapshot?.players[context.player.id]?.played.includes(CARD_ID)) return
    const positions = getActionNewlyUsedTiles(context)
    if (!hasClaimableFarmyardGoodsTokens(context.player, CARD_ID, positions)) return
    return {
      sourceCard: CARD_ID,
      flow: { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
        params: { kind: 'claim-farmyard-goods-tokens', positions } },
    }
  },
}

const exchange: CardListenerRegistration = {
  id: 'A40-potters-yard-exchange',
  cardIds: [CARD_ID],
  actions: ['special-effect'],
  phases: ['after'],
  handler: context => {
    if (context.sourceCard !== CARD_ID || context.params?.kind !== 'claim-farmyard-goods-tokens') return
    const clay = sumResourceMovedToPlayer(context.actionEvents?.filter(event => 'schemaVersion' in event), 'clay', context.player.id,
      event => event.sourceCardId === CARD_ID && event.from.kind === 'card' && event.from.cardId === CARD_ID)
    if (clay <= 0) return
    const children: ActionFlow[] = []
    for (let count = clay; count > 0; count--) {
      children.push({ type: 'seq', children: [
        payLeaf({ cardId: CARD_ID, cost: { clay: count } }),
        gainLeaf(CARD_ID, { food: 2 * count }),
      ] })
    }
    return { sourceCard: CARD_ID, flow: { type: 'xor', optional: true, children } }
  },
}

const cardImpl = {
  listeners: [collect, exchange],
  effect: {
    id: CARD_ID,
    onBuy: () => ({ type: 'leaf', actionId: PLACE_CLAY, sourceCard: CARD_ID }),
    getStatePresentation: player => {
      const clay = remainingClay(player)
      return { resourceGroups: clay > 0 ? [{ clay }] : [] }
    },
  },
  prerequisiteCheck: player => countUnusedFarmyardSpaces(player) <= 7,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A040_PottersYard = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Potter's Yard",
    deck: 'A',
    number: 40,
    category: 'GOODS_PROVIDER',
    desc: ["Immediately place 1 <CLAY> on each unused space in your farmyard. Each time you turn a space into a used space, you get the <CLAY> and you can immediately exchange it for 2 <FOOD>."],
    cost: { wood: 1, reed: 1 },
    prerequisite: 'At Most 7 Unused Farmyard Spaces',
    evenMoreSet: true,
    waresSalesmanGains: [{ clay: 1, reed: 1 }],
  },
  impl: cardImpl,
})

export const A040_PottersYard_impl = A040_PottersYard.impl
