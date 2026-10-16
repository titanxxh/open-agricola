import { afterEach, expect, it } from 'vitest'
import type { GameSession } from '../../../../server/game/authoritative-session'
import { createWorkSession } from '../../../../server/__tests__/_helpers/session-fixtures'
import { buildSowFarmInteraction } from '../../../domain/farmyard-interaction'
import { validateSow } from '../sow'
import '../../../cards/D/D075_WoodField'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
it('a one-seed budget rejects two slots of one logical field while a field cap alone allows both', () => {
  const session = createWorkSession({ configure(state) {
    state.round = 14
    const player = state.players[0]!
    player.minorPlayed = ['D075_WoodField']
    player.occupationPlayed = ['A100_Curator']
    player.resources.wood = 2
  } })
  sessions.push(session)
  const state = session.getState().state
  const player = state.players[0]!
  const farm = session.withCtx(() => buildSowFarmInteraction(player))
  expect(farm.farmType).toBe('sow')
  if (farm.farmType !== 'sow') throw new Error('Expected Sow permissions')
  const crops = farm.selectableFields.map(field => ({ ...field.tile, crop: 'wood' as const }))
  expect(crops).toHaveLength(2)
  const context = { actionHooks: session.actionHooks, state, player, space: state.actionSpaces.find(space => space.id === 'grain-utilization')! }
  expect(session.withCtx(() => validateSow({ ...context, actionContext: { maxSelections: 1 } }, crops)).validated.ok).toBe(true)
  expect(session.withCtx(() => validateSow({ ...context, actionContext: { maxSelections: 1, maxSeedSelections: 1 } }, crops)).validated.ok).toBe(false)
  expect(session.withCtx(() => validateSow({ ...context, actionContext: { maxSelections: 1, maxSeedSelections: 1 } }, crops.slice(0, 1))).validated.ok).toBe(true)
})
