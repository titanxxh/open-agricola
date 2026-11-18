import type { GameState } from '../../contract/types'

/** Printed classic-board columns, independent of the responsive UI orientation.
 * Round cards retain their slot's position when the reveal order changes.
 */
type Slot = { id: string; board: number; column: number; row: number }
const baseColumns = [
  ['copse', 'grove', 'resource-market-4', 'hollow-4', 'lessons-4', 'traveling-players'],
  ['farm-expansion', 'meeting-place', 'grain-seeds', 'farmland', 'lessons', 'day-laborer'],
  ['forest', 'clay-pit', 'reed-bank', 'fishing'],
]
const roundColumns = [[1, 2, 3, 4], [5, 6, 7], [8, 9], [10, 11], [12, 13], [14]]
const aliases: Record<string, string> = {
  'resource-market': 'resource-market-4',
  hollow: 'hollow-4',
  'lessons-3': 'lessons-4',
  'copse-56': 'copse',
  'grove-56': 'grove',
  'hollow-56': 'hollow-4',
  'traveling-players-56': 'traveling-players',
  'lessons-56-2f': 'lessons-4',
}
const slots = (state: GameState): Slot[] => {
  const result: Slot[] = []
  for (const space of state.actionSpaces) {
    const canonical = aliases[space.id] ?? space.id
    const column = baseColumns.findIndex((ids) => ids.includes(canonical))
    if (column >= 0)
      result.push({
        id: space.id,
        board: column < 2 ? 1 : 2,
        column,
        row: baseColumns[column]!.indexOf(canonical),
      })
  }
  roundColumns.forEach((rounds, index) =>
    rounds.forEach((round, row) => {
      const id = state.roundActionOrder[round - 1]
      if (id && round <= state.round)
        result.push({
          id,
          board: index < 2 ? 2 : 3,
          column: index + 3,
          row: row + (index === 1 ? 1 : 0),
        })
    }),
  )
  return result
}
export const getClassicBoardColumns = (state: GameState): string[][] => {
  const columns = new Map<number, string[]>()
  for (const slot of slots(state))
    columns.set(slot.column, [...(columns.get(slot.column) ?? []), slot.id])
  return [...columns.values()]
}
export const getClassicColumnSpaceIds = (state: GameState, id: string): string[] =>
  getClassicBoardColumns(state).find((column) => column.includes(id)) ?? []
export const getClassicAdjacentSpaceIds = (state: GameState, id: string): string[] => {
  const layout = slots(state)
  const from = layout.find((slot) => slot.id === id)
  if (!from) return []
  return layout
    .filter(
      (to) =>
        to.board === from.board &&
        Math.abs(to.column - from.column) + Math.abs(to.row - from.row) === 1,
    )
    .map((slot) => slot.id)
}
