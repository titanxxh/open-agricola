import { afterEach, it, describe } from 'vitest'
import * as audit53Cards from './_helpers/audit/ae-negative-53-cards'

describe('ae-negative-53-cards', () => {
  const { sessions, save, ok, make, finish, ready, resources, reward } = audit53Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C138 N1 Day Laborer chooses exactly sheep grain boar or cattle at their printed distinct prices', () => { for (const [good, food] of [['sheep', 102], ['grain', 102], ['boar', 101], ['cattle', 100]] as const) { const s = make('C138_AnimalFeeder'), p = ok(s.takeAction(0, 'day-laborer')), r = reward(s, p, 'C138_AnimalFeeder', { [good]: 1 }); resources(r, { [good]: 1, food }); save(`C138-N1-${good}`, { p, r }) } })
  it('C138 N2 nonmatching owner actual opponent Day Laborer and card in hand cannot grant Animal Feeder goods', () => { const s = make('C138_AnimalFeeder'), a = finish(s, ok(s.takeAction(0, 'grain-seeds')), false); ready(s); const r = finish(s, ok(s.takeAction(1, 'day-laborer')), false); resources(r, { grain: 1, sheep: 0, boar: 0, cattle: 0 }); resources(r, { food: 102, grain: 0, sheep: 0 }, 1); const c = make('C138_AnimalFeeder', undefined, false), cr = finish(c, ok(c.takeAction(0, 'day-laborer')), false); resources(cr, { food: 102, grain: 0, sheep: 0 }); save('C138-N2', { a, r, cr }) })
})
