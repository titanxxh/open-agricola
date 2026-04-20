import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'

export const TEST_1 = new Occupation({ id: 'TEST_1', name: 'Test', deck: 'A', number: 1 })

export const TEST_1_impl = {
  listeners: [{
  id: 'test-listener',
  cardIds: ['TEST_1'],
  handler: () => undefined,
}],
  reaches: [] as readonly string[],
}
