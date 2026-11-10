import type { ActionExecutionContext, PlayerState, Resource, Trade } from '../../contract/types'
import { resolveBuildPlayers } from '../../actions/helpers/build-players'

export const constructedRoomMaterial = (context: Pick<ActionExecutionContext, 'state' | 'player' | 'actionContext'>): PlayerState['houseType'] | undefined =>
  resolveBuildPlayers(context)?.farmOwner.houseType

export const constructUnitPriceTrade = (
  sourceId: string,
  price: Partial<Resource>,
): Trade => ({
  from: {}, to: {}, scope: 'unit', sourceId, unitPrice: price,
})

export const constructUnitDiscountTrade = (
  sourceId: string,
  discount: Partial<Resource>,
): Trade => ({
  from: {},
  to: discount,
  scope: 'unit',
  sourceId,
  replaceUpTo: true,
})
