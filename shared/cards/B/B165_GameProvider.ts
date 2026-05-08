import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { fieldTopStack, fieldDecrementTop } from '../../domain/field'
import type { CardImpl } from '../registry'
import { B165_GameProvider } from '../../cards-display/B/B165_GameProvider'

const CARD_ID = 'B165_GameProvider'

registerSelectionEffect('discard-grain-for-pigs', ({ player, positions }) => {
  let grainsRemoved = 0
  for (const key of positions) {
    const [r, c] = key.split('-').map(Number)
    const field = player.fields.find(f => f.row === r && f.col === c)
    if (!field) continue
    const top = fieldTopStack(field)
    if (top && top.kind === 'grain' && top.remaining > 0) {
      fieldDecrementTop(field)
      grainsRemoved++
    }
  }
  const pigs = grainsRemoved >= 4 ? 3 : grainsRemoved >= 3 ? 2 : grainsRemoved >= 1 ? 1 : 0
  player.resources.boar = (player.resources.boar ?? 0) + pigs
})

export const B165_GameProvider_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvestFieldPhase: (_state, player) => {
    const grainFields = player.fields.filter(f => fieldTopStack(f)?.kind === 'grain')
    if (grainFields.length === 0) return

    return {
      type: 'leaf',
      actionId: 'selection',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        selectionKind: 'farm-position',
        positionFilter: 'has-grain',
        maxSelections: 4,
        selectionEffect: 'discard-grain-for-pigs',
      },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
