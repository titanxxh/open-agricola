import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { registerHarvestFeedingRequirementModifier } from '../../../actions/helpers/harvest-feeding-requirement'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { getRoundPersonPlacementDetails, getSpaceUsePersonPlacementOrdinal } from '../../helpers/round-placement'
import type { Resource } from '../../../contract/types'

const CARD_ID = 'CFL043_RubenesqueWoman'

registerHarvestFeedingRequirementModifier(CARD_ID, () => 1)
const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-second-person',
      cardIds: [CARD_ID],
      actionSpaces: 'all',
      phases: ['before'],
      handler: ({ player, space, actionSpaceUse, actionContext }) => {
        const relocatedWorkerId = actionContext?.viaCardJump === true
          ? actionContext.workerId
          : actionContext?.moveFarmerWorkerId ?? actionContext?.placedWorkerId ?? actionContext?.workerId
        const ordinal = actionSpaceUse?.personUse?.placementOrdinal ?? (actionSpaceUse?.newPlacement
          ? getRoundPersonPlacementDetails(player).length + 1
          : getSpaceUsePersonPlacementOrdinal(player, { workerId: relocatedWorkerId }))
        if (ordinal !== 2) return
        const resource = Object.entries(space?.gainPerRound ?? {}).find(
          ([, value]) => (value ?? 0) > 0,
        )?.[0] as keyof Resource | undefined
        if (resource) return { flow: gainLeaf(CARD_ID, { [resource]: 1 }) }
      },
    },
  ],
} satisfies CardImpl

export const CFL043_RubenesqueWoman = defineOccupationCard({
  meta: {
    id: 'CFL043_RubenesqueWoman',
    name: 'Rubenesque Woman',
    deck: 'CFL',
    number: 43,
    players: '1+',
    desc: [
      'Whenever your second person in a round uses an accumulation space, you get 1 additional good of its type. During each harvest, you require 1 additional <FOOD>.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL043.png',
  },
  impl: cardImpl,
})
