import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'

registerCardListener({
  id: 'test-listener',
  cardIds: ['TEST_1'],
  handler: () => undefined,
})

export const TEST_1 = new Occupation({ id: 'TEST_1', name: 'Test', deck: 'A', number: 1 })
