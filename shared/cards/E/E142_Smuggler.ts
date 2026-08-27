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

const exchangeLeaf = ({ from, to }: TradeOption): ActionFlow => ({
  type: 'leaf',
  actionId: 'exchange',
  sourceCard: CARD_ID,
  actionContext: {
    directTrade: { from, to, sourceId: CARD_ID },
  },
  choiceLabelKey: 'ui.interactionResourceExchange',
  choiceLabelParams: {
    resourcesPaid: from,
    resourcesGained: to,
  },
  effectPreview: {
    kind: 'resourceExchange',
    resourcesPaid: from,
    resourcesGained: to,
  },
})

const exchangeStage = (): ActionFlow => ({
  type: 'xor',
  optional: true,
  children: TRADE_OPTIONS.map(exchangeLeaf),
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onHarvestFeedingPhase: () => ({
      type: 'seq',
      children: [exchangeStage(), exchangeStage()],
    }),
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
