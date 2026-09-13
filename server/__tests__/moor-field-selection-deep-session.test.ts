import { describe, expect, it } from 'vitest'
import { setupMoorAudit, advanceMoorAuditToRound } from './_helpers/moor-rules-audit'

describe('Moor field selection and consumption clauses', () => {
  it.each([0, 3])('M095 can select %i fields after rejecting more than three and cannot harvest stored food', (count) => {
    const session = setupMoorAudit(2, 3)
    const cardId = 'M095_FallowFields'
    const player = session.state.players[0]!
    player.minorHand = [cardId]
    player.fields = [1, 2, 3, 4].map((col) => ({ row: 0, col, stacks: [] }))
    session.loadState(session.state)
    expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
    let response = session.resolveChoice(0, cardId)
    expect(response.ok, response.error).toBe(true)
    const before = JSON.stringify(response.state)
    response = session.commitSelectionChoice(0, { positions: player.fields })
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
    response = session.commitSelectionChoice(0, { positions: player.fields.slice(0, count) })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmyardSpaceStates).toHaveLength(count)
    const tokens = structuredClone(response.state.players[0]!.farmyardSpaceStates)
    response = advanceMoorAuditToRound(session, 5)
    expect(response.state.players[0]!.farmyardSpaceStates).toEqual(tokens)
    expect(response.state.players[0]!.resources.food).toBe(16)
    session.state.players[0]!.resources.grain = 1
    response = session.takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.request.kind !== 'farm-select') expect(session.resolveChoice(0, 'sow').ok).toBe(true)
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(count ? 18 : 16)
    expect(response.state.players[0]!.farmyardSpaceStates).toHaveLength(count ? count - 1 : 0)
  })

  it.each([false, true])('M111 permits two crop spaces, with a direct legal submission: %s', (legal) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.minorPlayed = ['M111_NoTillFarming']
    player.fields = [{ row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] }]
    player.resources.grain = 3
    session.loadState(session.state)
    let response = session.takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.request.kind !== 'farm-select') expect(session.resolveChoice(0, 'sow').ok).toBe(true)
    const crops = [2, 3, 4].map((col) => ({ row: 1, col, crop: 'grain' }))
    if (!legal) {
      response = session.commitSelectionChoice(0, { crops })
      expect(response.ok).toBe(false)
      expect(response.state.players[0]!.resources.grain).toBe(3)
      expect(response.state.players[0]!.farmyardSpaceStates).toEqual([])
      expect(response.interaction.stateId).toBe('wait')
      expect(response.interaction.request.kind).toBe('farm-select')
      expect(response.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy).toHaveLength(1)
    }
    response = session.commitSelectionChoice(0, { crops: crops.slice(0, 2) })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.fields).toHaveLength(2)
    expect(response.state.players[0]!.farmyardSpaceStates).toHaveLength(2)
    expect(response.scores![0]!.categories.find((category) => category.key === 'empty')?.quantity).toBe(11)
    response = session.takeAnytimeAction(0, 'M111-no-till-farming-discard-crops')
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { positions: [{ row: 1, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmyardSpaceStates).toEqual([expect.objectContaining({ spaceKey: '1-3', crop: { kind: 'grain', remaining: 3 } })])
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })
})
