import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { payGainFlow } from '../../helpers/pay-gain-node'
import { scheduleNextHarvestSkip } from '../../helpers/harvest-skip'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'

const CARD_ID = 'CFL027_TrappistBeer'

const SKIP_ACTION = 'card_CFL027_TrappistBeer_skip'
registerAdHocAction({
  id: SKIP_ACTION,
  nameKey: 'ui.interactionUseAbility',
  descriptionKey: 'ui.interactionUseAbility',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    scheduleNextHarvestSkip(player, CARD_ID)
    return { type: 'ok' }
  },
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBeforeHarvest: () =>
      payGainFlow({
        cardId: CARD_ID,
        cost: { grain: 1 },
        followUp: [{ type: 'leaf', actionId: SKIP_ACTION, sourceCard: CARD_ID }],
      }),
  },
} satisfies CardImpl

export const CFL027_TrappistBeer = defineMinorCard({
  meta: {
    id: 'CFL027_TrappistBeer',
    name: 'Trappist Beer',
    deck: 'CFL',
    number: 27,
    desc: [
      'At the start of each harvest, you may pay 1 <GRAIN> to skip the entire harvest, including feeding your family.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL027.png',
  },
  impl: cardImpl,
})
