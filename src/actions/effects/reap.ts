import type { ActionExecutionResult, PlayerState } from '../../game/types'

export const reap = (player: PlayerState): ActionExecutionResult => {
  player.fields.forEach((field) => {
    if (!field.crop || field.remaining <= 0) return
    player.resources[field.crop] += 1
    field.remaining -= 1
    if (field.remaining === 0) {
      field.crop = null
    }
  })
  return { type: 'ok' }
}
