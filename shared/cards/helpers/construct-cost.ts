import type { Resource, Trade } from '../../contract/types'

export const constructUnitDiscountTrade = (
  sourceId: string,
  discount: Partial<Resource>,
): Trade => ({
  from: {},
  to: discount,
  scope: 'unit',
  sourceId,
})
