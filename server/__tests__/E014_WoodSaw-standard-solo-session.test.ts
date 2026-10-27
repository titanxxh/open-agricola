import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { work, buyMinor, openMinor, restore, acceptCard } from './_helpers/standard-solo-cards'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { setActiveWorkerCount, workersAvailable } from '../../shared/domain/player'

const CARD = 'E014_WoodSaw'
const ANYTIME = 'E14-wood-saw-anytime'
const evidence = createScenarioEvidence(import.meta.url)

describe('Wood Saw adopted solo interpretation', () => {
  it('can be purchased in solo without granting a free construction, while ordinary construction still works', () => {
    const original = evidence.track(work({ playerCount: 1, moor: false, seed: 6014, configure(state) {
      Object.assign(state.players[0]!.resources, { food: 0, wood: 6, reed: 2 })
      state.players[0]!.minorHand = [CARD]
    } }))
    const bought = buyMinor(original, CARD)
    expect(bought.state.players[0]!.resources).toMatchObject({ wood: 5, reed: 2 })
    expect(bought.state.players[0]!.minorPlayed).toEqual([CARD])
    expect(bought.interaction.anytimeActions.some(action => action.id === ANYTIME)).toBe(false)
    for (let attempt = 0; attempt < 2; attempt++) assertRejectedUnchanged(original, () => original.takeAnytimeAction(0, ANYTIME))
    const session = evidence.track(restore(original))
    expect(session.getState().interaction.anytimeActions.some(action => action.id === ANYTIME)).toBe(false)
    confirmNext(session, session.getState())
    const score = session.getState().scores![0]!.total
    let response = session.takeAction(0, 'farm-expansion')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const construct = getChoiceOptions(response).find(option => option.labelKey === 'actions.construct.name')
      assert.ok(construct, JSON.stringify(response.interaction))
      response = session.resolveChoice(0, construct.value)
    }
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } } })
    response = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 3 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!).toMatchObject({ rooms: 3, resources: { wood: 0, reed: 0 }, minorPlayed: [CARD] })
    expect(response.state.actionSpaces.find(space => space.id === 'farm-expansion')?.takenBy).toEqual([{ playerId: 'p1', workerId: '2' }])
    expect(response.state.events.filter(event => event.type === 'farm.roomBuilt')).toHaveLength(1)
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.playMinorImprovement', params: expect.objectContaining({ improvements: CARD }) }))
    expect(response.scores![0]!.total - score).toBe(1)
    evidence.record('ordinary construction after solo purchase', response)
  })

  it('still grants construction without an extra worker when the real opponent has more people', () => {
    const session = evidence.track(work({ moor: false, seed: 6014, configure(state) {
      const owner = state.players[0]!
      Object.assign(owner.resources, { wood: 5, reed: 2 })
      owner.minorPlayed = [CARD]
      setActiveWorkerCount(state.players[1]!, 3)
      state.players[1]!.rooms = 3
      state.players[1]!.roomTiles.push({ row: 1, col: 4 })
    } }))
    let response = session.takeAction(0, 'farmland')
    expect(response.interaction.anytimeActions).toContainEqual(expect.objectContaining({ id: ANYTIME }))
    response = acceptCard(session, session.takeAnytimeAction(0, ANYTIME), CARD)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD, request: { kind: 'farm-select', farm: { farmType: 'room' } } })
    response = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 3 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!).toMatchObject({ rooms: 3, resources: { wood: 0, reed: 0 } })
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(response.state.actionSpaces.find(space => space.id === 'farm-expansion')?.takenBy).toEqual([])
    expect(response.interaction).toMatchObject({ stateId: 'wait', spaceId: 'farmland', request: { kind: 'farm-select' } })
    expect(session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } }).ok).toBe(true)
  })

  it.each([{ owner: 2, opponent: 2 }, { owner: 3, opponent: 2 }])('does not grant construction at family sizes $owner:$opponent', ({ owner, opponent }) => {
    const session = evidence.track(work({ moor: false, configure(state) {
      for (const [index, count] of [owner, opponent].entries()) {
        const player = state.players[index]!
        setActiveWorkerCount(player, count)
        if (count === 3) { player.rooms = 3; player.roomTiles.push({ row: 1, col: 4 }) }
      }
      state.players[0]!.minorPlayed = [CARD]
      Object.assign(state.players[0]!.resources, { wood: 5, reed: 2 })
    } }))
    const pending = session.takeAction(0, 'farmland')
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction.anytimeActions.some(action => action.id === ANYTIME)).toBe(false)
    assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, ANYTIME))
    assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, ANYTIME))
    expect(session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } }).ok).toBe(true)
  })

  it('does not grant an in-hand card or allow an unpaid solo purchase', () => {
    const session = evidence.track(work({ playerCount: 1, moor: false, configure(state) {
      state.players[0]!.minorHand = [CARD]
    } }))
    expect(session.getState().interaction.anytimeActions.some(action => action.id === ANYTIME)).toBe(false)
    const pending = openMinor(session)
    expect(getChoiceOptions(pending).some(option => option.value === CARD)).toBe(false)
    assertRejectedUnchanged(session, () => session.resolveChoice(0, CARD))
    assertRejectedUnchanged(session, () => session.resolveChoice(0, CARD))
    expect(session.state.players[0]!.minorHand).toEqual([CARD])
    expect(session.state.players[0]!.rooms).toBe(2)
  })
})
