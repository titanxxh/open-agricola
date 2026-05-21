import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { fieldTopStack, fieldDecrementTop } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'B165_GameProvider'

registerSelectionEffect('discard-grain-for-pigs', ({ player, positions }) => {
  const selected = positions.map((key) => {
    const [r, c] = key.split('-').map(Number)
    const field = player.fields.find(f => f.row === r && f.col === c)
    if (!field) return null
    const top = fieldTopStack(field)
    if (!top || top.kind !== 'grain' || top.remaining <= 0) return null
    return field
  })
  const selectedFields = selected.filter((field): field is NonNullable<typeof field> => field !== null)
  if (selectedFields.length !== selected.length) return
  for (const field of selectedFields) {
    fieldDecrementTop(field)
  }
  const grainsRemoved = selectedFields.length
  const pigs = grainsRemoved >= 4 ? 3 : grainsRemoved >= 3 ? 2 : grainsRemoved >= 1 ? 1 : 0
  player.resources.boar = (player.resources.boar ?? 0) + pigs
})

export const B165_GameProvider_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvestFieldPhase: (_state, player) => {
    const grainFields = player.fields.filter((f) => {
      const top = fieldTopStack(f)
      return top?.kind === 'grain' && top.remaining > 0
    })
    if (grainFields.length === 0) return

    return {
      type: 'leaf',
      actionId: 'selection',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        selectionKind: 'farm-position',
        selectableTiles: grainFields.map(({ row, col }) => ({ row, col })),
        minSelections: 1,
        maxSelections: Math.min(4, grainFields.length),
        allowedSelectionCounts: [1, 3, 4],
        selectionEffect: 'discard-grain-for-pigs',
      },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
