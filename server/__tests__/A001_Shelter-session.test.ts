import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A001_Shelter'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit02Immediate from './_helpers/audit/ae-negative-02-immediate'

const CARD_ID = 'A001_Shelter'

const setup = (pastureSize: 0 | 1 | 2) => {
  const session = new GameSession(1, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.resources.wood = 0
  player.stableTiles = []
  player.pastures = pastureSize === 0 ? [] : [{
    id: 'test-pasture',
    size: pastureSize,
    tiles: Array.from({ length: pastureSize }, (_, col) => ({ row: 0, col })),
    stables: 0,
    animalType: null,
    animalCount: 0,
  }]
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.options?.some((option) => option.value === CARD_ID)) return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'),
  )
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const option = response.interaction.stateId === 'wait'
    ? response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
    : undefined
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const stableChoice = (response: SessionResponse, accept: boolean) => {
  if (response.interaction.stateId !== 'wait') return undefined
  return response.interaction.request.options?.find((option) => accept
    ? option.value !== '__skip__' && option.value !== 'skip'
    : option.value === '__skip__' || option.value === 'skip')
}

describe('A001 Shelter parity', () => {
  it('A001 S1: Shelter builds one free stable inside a one-space pasture and passes', () => {
    const session = setup(1)
    let response = playMinor(session)
    const accept = stableChoice(response, true)
    expect(accept).toBeDefined()

    response = session.resolveChoice(0, accept!.value)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.kind).toBe('farm-select')
    expect(response.interaction.request.farm.selectableTiles).toEqual([{ row: 0, col: 0 }])
    response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 0 }] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toEqual([{ row: 0, col: 0 }])
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
  })

  it('A001 S2: Shelter can decline its free stable and still passes', () => {
    const session = setup(1)
    let response = playMinor(session)
    const decline = stableChoice(response, false)
    expect(decline).toBeDefined()

    response = session.resolveChoice(0, decline!.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('A001 S3: Shelter with no pasture offers no stable and passes', () => {
    const response = playMinor(setup(0))

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('A001 S4: Shelter excludes a two-space pasture from its free stable', () => {
    const response = playMinor(setup(2))

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })
})

describe('ae-negative-02-immediate', () => {
  const { setup, requireWait, play, accept } = audit02Immediate
  describe('negative audit 02 immediate effects', () => {
    it('A001 N1: Shelter rejects duplicate and foreign targets then builds one free stable', () => {
        const session = setup('A001_Shelter', state => {
          state.players[0]!.pastures = [
            { id: 'one', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 },
            { id: 'two', tiles: [{ row: 1, col: 2 }, { row: 1, col: 3 }], animalType: null, animalCount: 0 },
          ]
        })
        const before = undoRuleSnapshot(session.getState())
        let response = accept(session, play(session, 'A001_Shelter'))
        const tile = { row: 0, col: 2 }
        assert.equal(requireWait(response).request.kind, 'farm-select')
        for (const stables of [[tile, tile], [{ row: 1, col: 2 }], [response.state.players[0]!.roomTiles[0]!]]) {
          assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { stables }))
        }
        response = session.commitSelectionChoice(0, { stables: [tile] })
        assert.equal(response.ok, true, response.error)
        assert.deepEqual(response.state.players[0]!.stableTiles, [tile])
        assert.equal(response.state.players[0]!.resources.wood, 0)
        assert(response.state.players[1]!.minorHand.includes('A001_Shelter'))
        assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { stables: [tile] }))
        assertUndoRestored(before, session.undoAction())
        session.dispose()
      })
    it('A001 N2: Shelter cannot build a fifth stable when all four pieces are used', () => {
        const session = setup('A001_Shelter', state => {
          const player = state.players[0]!
          player.stableTiles = [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 1, col: 1 }]
          player.pastures = [{ id: 'one', tiles: [{ row: 1, col: 2 }], animalType: null, animalCount: 0 }]
        })
        const response = play(session, 'A001_Shelter')
        assert.equal(response.ok, true, response.error)
        assert.equal(response.state.players[0]!.stableTiles.length, 4)
        assert.equal(response.state.players[0]!.resources.wood, 0)
        assert(response.state.players[1]!.minorHand.includes('A001_Shelter'))
        assert.equal(requireWait(response).request.kind, 'confirm-next-player')
        session.dispose()
      })
    it('A001 N3: Shelter must reject a stable inside a two-space pasture', () => {
        const session = setup('A001_Shelter', state => {
          state.players[0]!.pastures = [
            { id: 'one', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 },
            { id: 'two', tiles: [{ row: 1, col: 2 }, { row: 1, col: 3 }], animalType: null, animalCount: 0 },
          ]
        })
        accept(session, play(session, 'A001_Shelter'))
        assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { stables: [{ row: 1, col: 2 }] }))
        const response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
        assert.equal(response.ok, true, response.error)
        assert.equal(response.state.players[0]!.stableTiles.length, 1)
        assert.equal(response.state.players[0]!.resources.wood, 0)
        session.dispose()
      })
  })
})
