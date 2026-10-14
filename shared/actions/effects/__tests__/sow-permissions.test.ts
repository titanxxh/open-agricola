import { expect, it } from 'vitest'
import { createInitialState } from '../../../session/state-bootstrap'
import { isUnconditionalSow } from '../sow'

function player() {
  const player = createInitialState(42, { playerCount: 2 }).players[0]!
  player.minorPlayed = ['D071_Changeover']
  player.fields = [{ row: 0, col: 0, stacks: [] }, { row: 0, col: 1, stacks: [] }]
  player.cardStates.D071_Changeover = { extraData: { selectedPositions: ['0-0'] } }
  return player
}
it('a selected field subset is restricted even without seeds in the supply', () => {
  expect(isUnconditionalSow({ allowedFields: 'fromSelectedFields', sourceCard: 'D071_Changeover' }, player())).toBe(false)
})
it('a selected set covering all eligible fields retains the usual permissions', () => {
  const owner = player()
  owner.cardStates.D071_Changeover = { extraData: { selectedPositions: ['0-0', '0-1'] } }
  expect(isUnconditionalSow({ allowedFields: 'fromSelectedFields', sourceCard: 'D071_Changeover' }, owner)).toBe(true)
})
it('empty exclusions and source attribution do not restrict Sow, while excluding an eligible field does', () => {
  expect(isUnconditionalSow({ excludedFields: [], sourceCard: 'D071_Changeover' }, player())).toBe(true)
  expect(isUnconditionalSow({ excludedFields: [{ row: 0, col: 1 }] }, player())).toBe(false)
})
it('field-count and crop-type limits do restrict the ordinary Sow action', () => {
  expect(isUnconditionalSow({ maxSelections: 1 }, player())).toBe(false)
  expect(isUnconditionalSow({ cropType: 'grain' }, player())).toBe(false)
})
