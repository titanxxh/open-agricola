import { defineOccupationCard } from '../card-source'
import { readCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import { createEventQuery } from '../../events/query'
import { getFarmyardTilePositions } from '../../domain/farm'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import type { ResourceLocation } from '../../contract/events'

const CARD_ID = 'B140_FarmyardWorker'
const PLACED_ROUND_KEY = 'placedRound'
const farmyardListener: CardListenerRegistration = {
  id: 'B140-farmyard-worker-after-farmyard',
  cardIds: [CARD_ID],
  events: ['farm.animalMoved', 'farm.sown', 'farm.cropAdded', 'resource.moved'],
  phases: ['after' as ActionHookPhase],
  mandatory: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.roundPhase !== 'work'
      || readCardExtraData<number>(context.player, CARD_ID, PLACED_ROUND_KEY) === context.state.round) return
    const onFarmyard = (location: ResourceLocation) =>
      location.kind === 'field' && location.playerId === context.player.id &&
      getFarmyardTilePositions(context.player).some((tile) => tile.row === location.row && tile.col === location.col)
    const events = createEventQuery((context.actionEvents ?? []).filter((event) =>
      !event.actorPlayerId || event.actorPlayerId === context.player.id,
    ))
    const placed = events.has('farm.animalMoved', (event) =>
      Object.values(event.newlyPlacedOnFarmyard ?? {}).some((count) => count > 0),
    ) || events.has('farm.sown', (event) =>
      event.sows.some((sow) => sow.added > 0 && onFarmyard(sow.location)),
    ) || events.has('farm.cropAdded', (event) =>
      event.crops.some((crop) => crop.amount > 0 && onFarmyard(crop.location)),
    ) || events.has('resource.moved', (event) =>
      onFarmyard(event.to) && Object.values(event.resources).some((count) => count > 0),
    )
    if (!placed) return
    return {
      flow: { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-extra-data', key: PLACED_ROUND_KEY, value: context.state.round } },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [farmyardListener],
  effect: {
  id: CARD_ID,
  // A plain source, not a timed rule: the work-end window rechecks it after a sibling places a good.
  onAllWorkersPlaced: (state, player) =>
    readCardExtraData<number>(player, CARD_ID, PLACED_ROUND_KEY) === state.round ? gainLeaf(CARD_ID, { food: 2 }) : undefined,
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B140_FarmyardWorker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Farmyard Worker',
    deck: 'B',
    number: 140,
    category: 'FOOD_PROVIDER',
    desc: ['At the end of each work phase in which you placed at least 1 good on 1 of your farmyard spaces, you get 2 <FOOD>.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const B140_FarmyardWorker_impl = B140_FarmyardWorker.impl
