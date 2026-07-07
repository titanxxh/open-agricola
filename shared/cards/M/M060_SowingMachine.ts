import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { buildSowFarmInteraction } from '../../domain/farmyard-interaction'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { ActionDefinition, ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import type { MoorSpecialActionId } from '../../moor/types'

const CARD_ID = 'M060_SowingMachine'
const POST_REORG_CHECK_ACTION_ID = 'card_M060_SowingMachine_post-reorg-sow-check'
const SPECIAL_ACTIONS: MoorSpecialActionId[] = [
  'cut-peat',
  'fell-trees',
  'slash-and-burn',
  'horse-market',
  'hiring-fair',
  'black-market',
  'illicit-work',
]

const canSow = (context: CardListenerContext) => {
  if ((context.player.resources.horse ?? 0) < 2) return false
  const farm = buildSowFarmInteraction(context.player)
  return farm.farmType === 'sow' && farm.selectableFields.length > 0
}

const sowFlow = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'sow',
  optional: true,
  sourceCard: CARD_ID,
})

const postReorgCheckAction: ActionDefinition = {
  id: POST_REORG_CHECK_ACTION_ID,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    if ((player.resources.horse ?? 0) < 2) return { type: 'ok' }
    const farm = buildSowFarmInteraction(player)
    if (farm.farmType !== 'sow' || farm.selectableFields.length === 0) return { type: 'ok' }
    return { type: 'flow', flow: sowFlow() }
  },
}

registerAdHocAction(postReorgCheckAction)

const listener: CardListenerRegistration = {
  id: 'M060-sowing-machine-after-special-action',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: SPECIAL_ACTIONS,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!canSow(context)) return
    return {
      flow: context.actionId === 'horse-market'
        ? { type: 'leaf', actionId: POST_REORG_CHECK_ACTION_ID, sourceCard: CARD_ID }
        : sowFlow(),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => (player.resources.horse ?? 0) >= 1,
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M060_SowingMachine = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Sowing Machine",
    deck: "M",
    number: 60,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Each time after you take a special action, if you then have at least 2 <HORSE>, you can also take a __Sow__ action."
    ],
    cost: {
        "wood": 3
    },
    prerequisite: "1 Horse",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M060_SowingMachine_impl = M060_SowingMachine.impl
