import { afterEach, it, describe } from 'vitest'
import * as audit50Cards from './_helpers/audit/ae-negative-50-cards'

describe('ae-negative-50-cards', () => {
  const { sessions, save, make, finish, end, resources } = audit50Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C124 N1 all six real harvests buy exactly two stone for the printed two two three three four one food', () => { for (const [round, cost] of [[4, 2], [7, 2], [9, 3], [11, 3], [13, 4], [14, 1]] as const) { const s = make('C124_StoneImporter', undefined, true, round), r = finish(s, end(s)); resources(r, { stone: 2, food: 96 - cost }); resources(r, { stone: 0, food: 96 }, 1); save(`C124-N1-${round}`, r) } })
  it('C124 N2 declining insufficient postfeeding food and nonharvest round cannot buy stone', () => { for (const [round, food] of [[4, 100], [4, 5], [5, 100]] as const) { const s = make('C124_StoneImporter', st => { st.players[0]!.resources.food = food }, true, round), r = finish(s, end(s), food === 5); resources(r, { stone: 0, food: round === 4 ? food - 4 : food }); save(`C124-N2-${round}-${food}`, r) } })
})
