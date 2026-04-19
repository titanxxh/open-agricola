import { Occupation } from '../../../shared/cards/types'
export const C1_Missing = new Occupation({ id: 'C1_Missing', name: 'Missing', deck: 'C', number: 1 })
export const C1_Missing_impl = {
  listeners: [{ id: 'x', cardIds: ['C1_Missing'], handler: () => {
    const other = 'D99_SomeOtherCard'  // should require reaches: ['D99_SomeOtherCard']
    return other
  } }],
  reaches: [] as readonly string[],
}
