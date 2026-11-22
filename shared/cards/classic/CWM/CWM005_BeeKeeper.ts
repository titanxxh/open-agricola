import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { positionKey } from '../../../domain/farm'

const CARD_ID = 'CWM005_BeeKeeper'

const MARK = 'card_' + CARD_ID + '_mark'
registerAdHocAction({
  id: MARK,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    const previous = readCardExtraData<string[]>(player, CARD_ID, 'previousStables') ?? []
    const built = player.stableTiles.find((tile) => !previous.includes(positionKey(tile)))
    if (built) writeCardExtraData(player, CARD_ID, 'beehive', positionKey(built))
    return { type: 'ok' }
  },
})
const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      writeCardExtraData(player, CARD_ID, 'previousStables', player.stableTiles.map(positionKey))
      return {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'stables',
            sourceCard: CARD_ID,
            actionContext: { exactCost: {}, max: 1 },
          },
          { type: 'leaf', actionId: MARK, sourceCard: CARD_ID },
        ],
      }
    },
    onComputeAnimalZones: (player, zones) => {
      const key = readCardExtraData(player, CARD_ID, 'beehive')
      for (const zone of zones) if (zone.id === 'stable:' + key) zone.blocked = true
    },
    computePastureCapacityModifiers: (player) => [
      {
        sourceCard: CARD_ID,
        kind: 'replacement',
        appliesTo: (context) =>
          context.pasture.tiles.some(
            (tile) => positionKey(tile) === readCardExtraData(player, CARD_ID, 'beehive'),
          ),
        apply: (capacity) => capacity / 2,
      },
    ],
    onStartHarvestFeedingPhase: () => gainLeaf(CARD_ID, { food: 1 }),
  },
} satisfies CardImpl

export const CWM005_BeeKeeper = defineOccupationCard({
  meta: {
    id: 'CWM005_BeeKeeper',
    name: "Beekeeper",
    deck: 'CWM',
    number: 5,
    desc: ["Immediately build a <STABLE> for free and lay it on its side. It loses its normal function but still scores as a <STABLE>. During each harvest feeding phase, you get 1 <FOOD>."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM005.png',
  },
  impl: cardImpl,
})

export const CWM005_BeeKeeper_impl = CWM005_BeeKeeper.impl
