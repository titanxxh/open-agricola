import { Occupation } from '../../../shared/cards-display/types'
export const C001_Missing = new Occupation({ id: 'C001_Missing', name: 'Missing', deck: 'C', number: 1 })
export const C001_Missing_impl = {
  listeners: [{ id: 'x', cardIds: ['C001_Missing'], handler: () => {
    const other = 'D099_SomeOtherCard'  // should require reaches: ['D099_SomeOtherCard']
    return other
  } }],
  reaches: [] as readonly string[],
}
