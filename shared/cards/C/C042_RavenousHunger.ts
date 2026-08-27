import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { computeAllowedPlacementSpaces } from '../../actions/helpers/placement-availability'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow, ActionSpace, Resource } from '../../contract/types'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'C042_RavenousHunger'
const accumulationSpaceIds = (context: CardListenerContext) =>
  computeAllowedPlacementSpaces(context.state, context.player, { sourceCard: CARD_ID })
    .map((placement) => context.state.actionSpaces.find((space) => space.id === placement.spaceId))
    .filter((space): space is ActionSpace =>
      !!space && Object.values(space.gainPerRound).some((amount) => (amount ?? 0) > 0),
    )
    .map((space) => space.id)

const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'C42-ravenous-hunger-after-place-farmer',
  cardIds: [CARD_ID],
  mandatory: true,
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard === CARD_ID) {
      const gain: Partial<Resource> = {}
      for (const [key, value] of Object.entries(context.space.gainPerRound)) {
        if ((value ?? 0) > 0) gain[key as keyof Resource] = 1
      }
      if (Object.keys(gain).length === 0) return
      return { flow: gainLeaf(CARD_ID, gain), sourceCard: CARD_ID }
    }
    if (context.space?.id !== 'vegetable-seeds') return
    if (workersAvailable(context.state, context.player) <= 0) return
    const constraints = accumulationSpaceIds(context)
    if (constraints.length === 0) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'place-farmer',
            sourceCard: CARD_ID,
            actionContext: { constraints },
          },
        ],
      } as ActionFlow,
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterPlaceFarmerListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C042_RavenousHunger = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Ravenous Hunger',
    deck: 'C',
    number: 42,
    category: 'GOODS_PROVIDER',
    desc: [
        'Immediately after each time you use the __Vegetable Seeds__ action space, you can place another person on an accumulation space and get 1 additional good of the accumulating type.',
      ],
    cost: { grain: 1 },
    players: '1+',
  },
  impl: cardImpl,
})

export const C042_RavenousHunger_impl = C042_RavenousHunger.impl
