import { MinorImprovement } from '../types'
import { getFenceCount } from '../../actions/effects/fencing'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'C54_MarketBooth'

// BGA cost is `[STABLE => 1]` — i.e. you must have 1 stable token in reserve.
// Our model does not have a separate stable-reserve pool; the closest equivalent
// is "the player still has at least one unbuilt stable" (stableTiles.length < 4).
// Encoded as a custom prerequisite so isBuyable rejects players with 4 stables built.
registerPrerequisite('1 Stable in Reserve', (player) => player.stableTiles.length < 4)

export const C54_MarketBooth = new MinorImprovement({
  id: CARD_ID,
  name: "Market Booth",
  deck: "C",
  number: 54,
  category: "FOOD_PROVIDER",
  desc: ["After the field phase of each harvest, you can exchange 1 <GRAIN> plus 1 <FENCE> (both from your supply) for 5 <FOOD>."],
  cost: {},
  prerequisite: '1 Stable in Reserve',
})

export const C54_MarketBooth_impl = {
  effect: {
    id: CARD_ID,
    onEndHarvestFieldPhase: (_state, player) => {
      if (player.resources.grain < 1) return
      if (getFenceCount(player) === 0) return

      return {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { grain: 1 }, sourceCard: CARD_ID },
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'consume-fence', count: 1 },
          },
          { type: 'leaf', actionId: 'gain', params: { food: 5 }, sourceCard: CARD_ID },
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
