import type { ActionExecutionResult, HarvestReapSummary, PlayerState } from '../../game/types'

export const reap = (
  player: PlayerState,
): ActionExecutionResult & { reapSummary: HarvestReapSummary } => {
  const reapSummary: HarvestReapSummary = {
    resources: {},
    grainFields: 0,
    vegetableFields: 0,
  }
  player.fields.forEach((field) => {
    if (!field.crop || field.remaining <= 0) return
    player.resources[field.crop] += 1
    reapSummary.resources[field.crop] = (reapSummary.resources[field.crop] ?? 0) + 1
    if (field.crop === 'grain') {
      reapSummary.grainFields += 1
    } else if (field.crop === 'vegetable') {
      reapSummary.vegetableFields += 1
    }
    field.remaining -= 1
    if (field.remaining === 0) {
      field.crop = null
    }
  })
  return { type: 'ok', reapSummary }
}
