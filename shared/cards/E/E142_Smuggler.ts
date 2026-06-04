import { defineOccupationCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E142_Smuggler'
type ResourceMap = Partial<Resource>
type TradeOption = {
  from: ResourceMap
  to: ResourceMap
}

export const TRADE_OPTIONS = [
  { from: { wood: 1 }, to: { grain: 1 } },
  { from: { grain: 1 }, to: { stone: 1 } },
] as const satisfies readonly TradeOption[]

const hasResources = (resources: Resource, cost: ResourceMap, multiplier = 1): boolean =>
  Object.entries(cost).every(([resource, amount]) => resources[resource as keyof Resource] >= amount * multiplier)

const scaleResources = (resources: ResourceMap, multiplier: number): ResourceMap =>
  Object.fromEntries(Object.entries(resources).map(([resource, amount]) => [resource, amount * multiplier])) as ResourceMap

const payGainFlow = ({ from, to }: TradeOption, multiplier = 1): ActionFlow => ({
  type: 'seq',
  children: [
    { type: 'leaf', actionId: 'pay', params: scaleResources(from, multiplier), sourceCard: CARD_ID },
    { type: 'leaf', actionId: 'gain', params: scaleResources(to, multiplier), sourceCard: CARD_ID },
  ],
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onHarvestFeedingPhase: (_state, player) => {
      const singleOptions = TRADE_OPTIONS
        .filter((trade) => hasResources(player.resources, trade.from))
        .map((trade) => payGainFlow(trade))
      const children: ActionFlow[] = TRADE_OPTIONS
        .filter((trade) => hasResources(player.resources, trade.from, 2))
        .map((trade) => payGainFlow(trade, 2))

      if (singleOptions.length > 0) {
        children.push({
          type: 'or',
          optional: true,
          children: singleOptions,
        })
      }

      if (children.length === 0) return

      return {
        type: 'xor',
        optional: true,
        children,
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E142_Smuggler = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Smuggler",
    deck: "E",
    number: 142,
    category: "CROPS",
    desc: [
        'In the feeding phase of each harvest, you can exchange up to 2 goods as follows:',
        '[<WOOD> <ARROW> <GRAIN>]',
        'or',
        '[<GRAIN> <ARROW> <STONE>]',
      ],
    cost: {},
    players: "3+",
  },
  impl: cardImpl,
})

export const E142_Smuggler_impl = E142_Smuggler.impl
