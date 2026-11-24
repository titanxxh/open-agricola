import type { GameState, PlayerState } from '../../../contract/types'
import { getAssignedAnimalsByType } from '../../../domain/animals'
import { defineMinorCard } from '../../card-source'
import { getCardStack, incCounter, pushToCardStack } from '../../helpers/card-state'
import { payLeaf } from '../../helpers/pay-gain-node'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CFL013_GiftTable'
const giftSheep = (player: PlayerState) => player.cardStates[CARD_ID]?.counters?.held ?? 0
const sheepInSupply = (player: PlayerState, state?: GameState) =>
  Math.min(giftSheep(player), Math.max(0, player.resources.sheep - getAssignedAnimalsByType(player, state).sheep))

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => pushToCardStack(player, CARD_ID, ['vegetable', 'wood', 'sheep', 'wood', 'grain']),
    onComputeAnimalZones: (player, zones, state) => {
      if (!giftSheep(player)) return
      zones.push({
        id: 'card:' + CARD_ID, zoneType: 'card', cardId: CARD_ID,
        capacity: 1, allowedAnimalType: 'sheep', animalType: 'sheep', animalCount: sheepInSupply(player, state),
        capacityCounterKey: 'held', capacityLossOnPayment: true,
      })
    },
    computeBreedableAnimalCount: (_state, player, species, count) =>
      species === 'sheep' ? Math.max(0, count - giftSheep(player)) : undefined,
    consumeAnimalPayment: (state, player, species, amount) => {
      // An ordinary payment uses other sheep first. Paying the last sheep ends the gift.
      if (species !== 'sheep' || !giftSheep(player) || amount < player.resources.sheep) return 0
      const supplied = sheepInSupply(player, state)
      incCounter(player, CARD_ID, 'held', -1)
      return supplied
    },
    onAnimalRemoved: (_state, player, species) => {
      if (species === 'sheep' && player.resources.sheep === 0 && giftSheep(player)) incCounter(player, CARD_ID, 'held', -1)
    },
  },
  listeners: [
    {
      id: CARD_ID + '-buy',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      preScoring: true,
      handler: ({ player }) => {
        const top = getCardStack(player, CARD_ID).at(-1)
        if (!top || player.resources.food < 1) return
        return {
          labelKey: 'cards.CFL013_GiftTable.buy',
          flow: { type: 'seq', children: [
            payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
            ...(top === 'sheep' ? [{
              type: 'leaf' as const, actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-counter', key: 'held', value: 1 },
            }] : []),
            { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
          ] },
        }
      },
    },
    {
      id: CARD_ID + '-exchange',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      preScoring: true,
      handler: ({ state, player }) => {
        if (!giftSheep(player) || player.resources.sheep < 1) return
        return {
          labelKey: 'cards.CFL013_GiftTable.exchange',
          flow: { type: 'seq', children: [
            {
              type: 'leaf', actionId: 'exchange', sourceCard: CARD_ID,
              actionContext: {
                directTrade: { from: { sheep: 1 }, to: { food: 2 }, sourceId: CARD_ID },
                ...(sheepInSupply(player, state) > 0 ? {
                  animalPaymentPreference: { animal: 'sheep', prefer: [{ kind: 'cardCounter', cardId: CARD_ID, counterKey: 'held' }] },
                } : {}),
              },
            },
            { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-counter', key: 'held', value: 0 } },
          ] },
        }
      },
    },
  ],
} satisfies CardImpl

export const CFL013_GiftTable = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Gift Table',
    deck: 'CFL',
    artUrl: 'assets/classic/CFL/CFL013.png',
    number: 13,
    cost: { wood: 1 },
    animalHolder: true,
    desc: ['Pile these goods on this card, from bottom to top: <VEGETABLE>, <WOOD>, <SHEEP>, <WOOD>, <GRAIN>. At any time, you may buy the top good for 1 <FOOD>. The purchased <SHEEP> moves to your supply. You may exchange it for 2 <FOOD> at any time. It does not breed and it counts for scoring.'],
  },
  presentation: { stack: true, counters: ['held'] },
  impl: cardImpl,
})
