import type { ActionFlow } from '../game/types'

export const wrapOptional = (flow: ActionFlow): ActionFlow => ({
  type: 'seq',
  optional: true,
  children: [flow],
})
