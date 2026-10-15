import { installOfficialCardRegistry } from '../../../cards/__tests__/card-environment'

installOfficialCardRegistry()

import { expect, it } from 'vitest'
import { createInitialState } from '../../../session/state-bootstrap'
import { isUnconditionalSow } from '../sow'
import '../../../cards/D/D075_WoodField'

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
it('fixed selected-field authorization stays restricted even when its selected set covers all eligible fields', () => {
  const owner = player()
  owner.cardStates.D071_Changeover = { extraData: { selectedPositions: ['0-0', '0-1'] } }
  expect(isUnconditionalSow({ allowedFields: 'fromSelectedFields', sourceCard: 'D071_Changeover' }, owner)).toBe(false)
})
it('empty exclusions and source attribution do not restrict Sow, while excluding an eligible field does', () => {
  expect(isUnconditionalSow({ excludedFields: [], sourceCard: 'D071_Changeover' }, player())).toBe(true)
  expect(isUnconditionalSow({ excludedFields: [{ row: 0, col: 1 }] }, player())).toBe(false)
})
it('field-count and crop-type limits do restrict the ordinary Sow action', () => {
  expect(isUnconditionalSow({ maxSelections: 1 }, player())).toBe(false)
  expect(isUnconditionalSow({ cropType: 'grain' }, player())).toBe(false)
})

it('seed budgets and crop whitelist reductions restrict Sow without relying on remaining empty fields', () => {
  const owner = player()
  owner.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] }]
  expect(isUnconditionalSow({ maxSeedSelections: 1 }, owner)).toBe(false)
  expect(isUnconditionalSow({ allowedCrops: ['grain'] }, owner)).toBe(false)
  expect(isUnconditionalSow({ allowedCrops: ['grain', 'vegetable'] }, owner)).toBe(true)
})

// #1160: action permissions exist before D017 can create a field. The public
// predicate is checked directly; its paid continuation has a Session regression.
it.each([
  { allowedCrops: ['grain'], expected: false },
  { allowedCrops: ['vegetable'], expected: false },
  { allowedCrops: ['wood'], expected: false },
  { allowedCrops: [], expected: false },
  { allowedCrops: ['grain', 'vegetable'], expected: true },
  { allowedCrops: ['grain', 'vegetable', 'wood', 'stone'], expected: true },
])('classifies allowed crops $allowedCrops before any field exists', ({ allowedCrops, expected }) => {
  const owner = player()
  owner.minorPlayed = []
  owner.fields = []
  expect(isUnconditionalSow({ allowedCrops }, owner)).toBe(expected)
  expect(isUnconditionalSow({ allowedCrops })).toBe(expected)
})

it('keeps the usual Wood Field permission while distinguishing an action crop limit', () => {
  const owner = player()
  owner.fields = []
  owner.minorPlayed = ['D075_WoodField']
  expect(isUnconditionalSow(undefined, owner)).toBe(true)
  expect(isUnconditionalSow({ allowedCrops: ['wood'] }, owner)).toBe(false)
  expect(isUnconditionalSow({ allowedCrops: ['grain', 'vegetable'] }, owner)).toBe(false)
  expect(isUnconditionalSow({ allowedCrops: ['grain', 'vegetable', 'wood'] }, owner)).toBe(true)
})
