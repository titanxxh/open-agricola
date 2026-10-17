import { afterEach, it, describe } from 'vitest'
import * as audit50Cards from './_helpers/audit/ae-negative-50-cards'

describe('ae-negative-50-cards', () => {
  const { sessions, save, ok, make, finish, ready, resources } = audit50Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C126 N1 Day Laborer mandatory wood clay remain whether optional stone is bought or declined', () => { for (const accept of [true, false]) { const s = make('C126_Excavator'), r = finish(s, ok(s.takeAction(0, 'day-laborer')), accept); resources(r, { wood: 1, clay: 1, stone: accept ? 1 : 0, food: accept ? 101 : 102 }); save(`C126-N1-${accept}`, r) } })
  it('C126 N2 nonmatching owner action actual opponent Day Laborer and unplayed card never grant Excavator goods', () => { const s = make('C126_Excavator'), a = finish(s, ok(s.takeAction(0, 'grain-seeds'))); ready(s); const r = finish(s, ok(s.takeAction(1, 'day-laborer'))); resources(r, { wood: 0, clay: 0, stone: 0 }); resources(r, { food: 102, wood: 0, clay: 0, stone: 0 }, 1); const c = make('C126_Excavator', undefined, false), cr = finish(c, ok(c.takeAction(0, 'day-laborer'))); resources(cr, { food: 102, wood: 0, clay: 0, stone: 0 }); save('C126-N2', { a, r, cr }) })
})
