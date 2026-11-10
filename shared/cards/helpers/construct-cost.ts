import type { ActionExecutionContext, PlayerState, Resource, Trade } from '../../contract/types'
import { resolveBuildPlayers } from '../../actions/helpers/build-players'

export const constructedRoomMaterial = (context: Pick<ActionExecutionContext, 'state' | 'player' | 'actionContext'>): PlayerState['houseType'] | undefined =>
  resolveBuildPlayers(context)?.farmOwner.houseType

export const constructUnitPriceTrade = (
  context: Pick<ActionExecutionContext, 'state' | 'player' | 'actionContext'>,
  sourceId: string,
  price: Partial<Resource>,
): Trade => {
  const material = constructedRoomMaterial(context) ?? context.player.houseType
  const ordinary: Partial<Resource> = { [material]: 5, reed: 2 }
  const from: Partial<Resource> = {}
  const to: Partial<Resource> = {}
  for (const key of new Set([...Object.keys(ordinary), ...Object.keys(price)] as (keyof Resource)[])) {
    const delta = (ordinary[key] ?? 0) - (price[key] ?? 0)
    if (delta > 0) to[key] = delta
    if (delta < 0) from[key] = -delta
  }
  return {
    from, to, scope: 'unit', sourceId,
    ...(resolveBuildPlayers(context)?.farmOwner.id !== context.player.id ? { unitPrice: price } : {}),
  }
}

export const constructUnitDiscountTrade = (
  sourceId: string,
  discount: Partial<Resource>,
): Trade => ({
  from: {},
  to: discount,
  scope: 'unit',
  sourceId,
})
