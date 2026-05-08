import { Occupation } from '../../../shared/cards-display/types'
export const B1_Clean = new Occupation({ id: 'B1_Clean', name: 'Clean', deck: 'B', number: 1 })
export const B1_Clean_impl = {
  listeners: [{ id: 'x', cardIds: ['B1_Clean'], handler: () => {} }],
  reaches: [] as readonly string[],
}
