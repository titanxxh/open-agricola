import type { ActionExecutionContext, PlayerState, Resource, Trade } from '../../contract/types'

export const constructedRoomMaterial = (context: Pick<ActionExecutionContext, 'player'>): PlayerState['houseType'] =>
  context.player.houseType

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
