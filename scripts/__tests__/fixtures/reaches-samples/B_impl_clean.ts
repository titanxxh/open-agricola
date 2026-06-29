import { Occupation } from '../../../shared/cards-display/types'
export const B001_Clean = new Occupation({ id: 'B001_Clean', name: 'Clean', deck: 'B', number: 1 })
export const B001_Clean_impl = {
  listeners: [{ id: 'x', cardIds: ['B001_Clean'], handler: () => {} }],
  reaches: [] as readonly string[],
}
