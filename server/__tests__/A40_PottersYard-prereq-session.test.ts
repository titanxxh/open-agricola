import { describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { A040_PottersYard } from '../../shared/cards/A/A040_PottersYard'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { getAllTilePositions } from '../../shared/domain/farm'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const setup = () => {
  const session = sessionEvidence.track(createWorkSession())

  return session
}

describe('A040_PottersYard prerequisite', () => {
  it('blocks when player has more than 7 free farmyard spaces', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(session.withCtx(() => meetsCardPrerequisites(player, A040_PottersYard, state.round, state))).toBe(false)
  })

  it('allows when free spaces <= 7 (e.g. 8 spaces used)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.roomTiles = getAllTilePositions().slice(0, 8)
    player.fields = []
    player.stableTiles = []
    player.pastures = []
    expect(session.withCtx(() => meetsCardPrerequisites(player, A040_PottersYard, state.round, state))).toBe(true)
  })
})
