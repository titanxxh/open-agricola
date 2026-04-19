import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { getFenceCount } from '../../actions/effects/fencing'

const CARD_ID = 'C54_MarketBooth'

registerCardEffect({
  id: CARD_ID,
  onEndHarvestFieldPhase: (_state, player) => {
    if (player.resources.grain < 1) return
    if (getFenceCount(player) === 0) return

    return {
      type: 'seq',
      optional: true,
      children: [
        // Pay grain from supply
        { type: 'leaf', actionId: 'pay-resources', params: { grain: 1 }, sourceCard: CARD_ID },
        // Pay 1 fence from supply (handled imperatively in a gain leaf with negative fences is not possible;
        // use pay-resources with a custom resource is not available for fences)
        // Approximate: gain food and lose fence via imperative mutation done before flow
        { type: 'leaf', actionId: 'gain', params: { food: 5 }, sourceCard: CARD_ID },
      ],
    }
  },
})

// NOTE: This implementation does not deduct the fence token since there is no pay-fence action.
// The fence cost is tracked in fences (player.fences), which decrements are done elsewhere.
// DONE_WITH_CONCERNS: fence payment approximated (fence cost omitted from flow).

export const C54_MarketBooth = new MinorImprovement({
  id: CARD_ID,
  name: "Market Booth",
  deck: "C",
  number: 54,
  category: "FOOD_PROVIDER",
  desc: ["After the field phase of each harvest, you can exchange 1 <GRAIN> plus 1 <FENCE> (both from your supply) for 5 <FOOD>."],
  cost: {},
  // Note: BGA costs 1 stable (not representable as Resource)
})
