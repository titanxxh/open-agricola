import type { ActionExecutionResult, HarvestReapSummary, PlayerState } from '../../game/types'
import { fieldTopStack, fieldPopIfDepleted } from '../../game/field'

export const reap = (
  player: PlayerState,
): ActionExecutionResult & { reapSummary: HarvestReapSummary } => {
  const reapSummary: HarvestReapSummary = {
    resources: {},
    grainFields: 0,
    vegetableFields: 0,
  }
  player.fields.forEach((field) => {
    const top = fieldTopStack(field)
    if (!top || top.remaining <= 0) return
    const kind = top.kind
    player.resources[kind] = (player.resources[kind] ?? 0) + 1
    reapSummary.resources[kind] = (reapSummary.resources[kind] ?? 0) + 1
    if (kind === 'grain') {
      reapSummary.grainFields += 1
    } else {
      reapSummary.vegetableFields += 1
    }
    top.remaining -= 1
    fieldPopIfDepleted(field)
  })
  return { type: 'ok', reapSummary }
}
