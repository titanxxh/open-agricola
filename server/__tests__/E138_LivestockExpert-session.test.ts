import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit53Cards from './_helpers/audit/ae-negative-53-cards'

describe('ae-negative-53-cards', () => {
  const { sessions, save, ok, make, finish, lesson, resources, farm } = audit53Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E138 N1 actual round eleven Lessons doubles exactly two physical sheep to four without counting the aggregate twice', () => { const s = make('E138_LivestockExpert', st => farm(st, 'sheep', 2), false, 11), p = lesson(s, 'E138_LivestockExpert'), r = finish(s, p, true); save('E138-N1', { p, r }); assert.equal(r.state.players[0]!.pastures[0]!.animalCount, r.state.players[0]!.resources.sheep); assertRuleOutcome(r.state.players[0]!.resources.sheep, 4); resources(r, { food: 100 }) })
  it('E138 N2 actual round twelve Lessons and zero animals or card in hand cannot multiply farm animals', () => { const s = make('E138_LivestockExpert', st => farm(st, 'sheep', 2), false, 12), r = finish(s, lesson(s, 'E138_LivestockExpert'), false); resources(r, { sheep: 2 }); const c = make('E138_LivestockExpert', undefined, false, 11), cr = finish(c, lesson(c, 'E138_LivestockExpert'), false); resources(cr, { sheep: 0, boar: 0, cattle: 0 }); const a = make('E138_LivestockExpert', st => farm(st, 'sheep', 2), false, 11), ar = finish(a, ok(a.takeAction(0, 'day-laborer')), false); resources(ar, { sheep: 2 }); save('E138-N2', { r, cr, ar }) })
})
