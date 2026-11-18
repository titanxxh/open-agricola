import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { readCardExtraData, writeCardExtraData, incCounter } from '../../helpers/card-state'
import { payGainActionFlow, gainLeaf } from '../../helpers/pay-gain-node'
import type { PlayerState } from '../../../contract/types'

const CARD_ID = 'CFL013_GiftTable'

const TAKE = 'card_CFL013_GiftTable_take'
const stack = (player: PlayerState) =>
  readCardExtraData<Array<'vegetable' | 'wood' | 'sheep' | 'grain'>>(player, CARD_ID, 'stack') ?? []
const held = (player: PlayerState) => player.cardStates?.[CARD_ID]?.counters?.held ?? 0
registerAdHocAction({
  id: TAKE,
  nameKey: `cards.${CARD_ID}.name`,
  descriptionKey: `cards.${CARD_ID}.name`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => stack(player).length > 0,
  execute: ({ player }) => {
    const items = [...stack(player)]
    const item = items.pop()
    if (!item) return { type: 'fail', errorKey: 'log.actionFail' }
    writeCardExtraData(player, CARD_ID, 'stack', items)
    if (item === 'sheep') incCounter(player, CARD_ID, 'held', 1)
    return { type: 'flow', flow: gainLeaf(CARD_ID, { [item]: 1 }) }
  },
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      writeCardExtraData(player, CARD_ID, 'stack', ['vegetable', 'wood', 'sheep', 'wood', 'grain'])
    },
    onComputeAnimalZones: (player, zones) => {
      if (held(player) > 0)
        zones.push({
          id: `card:${CARD_ID}`,
          zoneType: 'card',
          cardId: CARD_ID,
          capacity: 1,
          animalType: 'sheep',
          animalCount: 1,
          allowedAnimalType: 'sheep',
          capacityCounterKey: 'held',
          capacityLossOnPayment: true,
          fixedAnimalCounts: { sheep: 1 },
        })
    },
    computeBreedableAnimalCount: (_state, player, animal, count) =>
      animal === 'sheep' ? Math.max(0, count - held(player)) : undefined,
    consumeAnimalPayment: (_state, player, animal, amount) => {
      if (animal !== 'sheep') return 0
      const used = Math.min(held(player), amount)
      if (used) incCounter(player, CARD_ID, 'held', -used)
      return used
    },
  },
  listeners: [
    {
      id: CARD_ID + '-buy-or-cook',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ player }) => {
        const children = []
        if (stack(player).length)
          children.push(
            payGainActionFlow({
              cardId: CARD_ID,
              cost: { food: 1 },
              followUp: [{ type: 'leaf', actionId: TAKE, sourceCard: CARD_ID }],
            }),
          )
        if (held(player))
          children.push(
            payGainActionFlow({ cardId: CARD_ID, cost: { sheep: 1 }, gain: { food: 2 } }),
          )
        return children.length ? { flow: { type: 'xor', children } } : undefined
      },
    },
  ],
} satisfies CardImpl

export const CFL013_GiftTable = defineMinorCard({
  meta: {
    id: 'CFL013_GiftTable',
    name: 'Gift Table',
    deck: 'CFL',
    number: 13,
    cost: {
      wood: 1,
    },
    desc: [
      'Stack a vegetable, wood, sheep, wood, and grain from bottom to top. At any time, pay 1 <FOOD> to take the top item. The sheep stays in your supply, cannot breed, counts for scoring, and can be converted to 2 <FOOD>.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL013.png',
    animalHolder: true,
  },
  presentation: { stack: true, counters: ['held'] },
  impl: cardImpl,
})
