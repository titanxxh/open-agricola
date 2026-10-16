import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A001_Shelter'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A001_Shelter'

const setup = (pastureSize: 0 | 1 | 2) => {
  const session = evidence.track(createWorkSession({ seed: 1, options: { playerCount: 2 } }))
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

    tiles: Array.from({ length: pastureSize }, (_, col) => ({ row: 0, col })),

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
  if (getChoiceOptions(response)?.some((option) => option.value === CARD_ID)) return response
  const improvement = getChoiceOptions(response)?.find((option) =>
    option.value.startsWith('action-improvement-'),
  )
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const option = response.interaction.stateId === 'wait'
    ? getChoiceOptions(response)?.find((candidate) => candidate.value === CARD_ID)
    : undefined
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const stableChoice = (response: SessionResponse, accept: boolean) => {
  if (response.interaction.stateId !== 'wait') return undefined
  return getChoiceOptions(response)?.find((option) => accept
    ? option.value !== '__skip__' && option.value !== 'skip'
    : option.value === '__skip__' || option.value === 'skip')
}

describe('A001 Shelter parity', () => {


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

describe('A001 rule boundaries', () => {

  const occupations = ['A116_WoodCutter', 'A118_Treegardener', 'A119_FirewoodCollector', 'A103_Portmonger']

  function setup(card: string, configure: (state: GameState) => void = () => { }) {
    return evidence.track(createWorkSession({
      configure(state) {
        state.players[0]!.minorHand = [card]
        state.players[0]!.occupationHand = [...occupations]
        for (const player of state.players) {
          player.resources.wood = 0
          player.resources.food = 0
        }
        configure?.(state)
      }
    }))
  }

  function requireWait(response: SessionResponse) {
    assert.equal(response.ok, true, response.error)
    assert(response.interaction.stateId === 'wait')
    return response.interaction
  }

  function play(session: ReturnType<typeof setup>, card: string) {
    let response = session.takeAction(0, 'meeting-place')
    requireWait(response)
    if (!response.state.players[0]!.minorHand.includes(card))
      return response
    if (!choices(response).some(option => option.value === card)) {
      const improvement = choices(response).find(option => option.value.startsWith('action-improvement-'))
      assert(improvement)
      response = session.resolveChoice(0, improvement.value)
      if (!response.state.players[0]!.minorHand.includes(card))
        return response
      requireWait(response)
    }
    assert(choices(response).some(option => option.value === card))
    return session.resolveChoice(0, card)
  }

  function choices(response: SessionResponse) {
    const request = requireWait(response).request
    assert(request.kind === 'choice')
    return request.options
  }

  function accept(session: ReturnType<typeof setup>, response: SessionResponse) {
    const candidates = choices(response).filter(candidate => !['skip', '__skip__'].includes(candidate.value))
    assert.equal(candidates.length, 1, JSON.stringify(response.interaction))
    return session.resolveChoice(0, candidates[0]!.value)
  }

  it("Shelter rejects duplicate and foreign targets then builds one free stable", () => {
    const session = setup('A001_Shelter', state => {
      state.players[0]!.pastures = [
        { id: 'one', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 },
        { id: 'two', tiles: [{ row: 1, col: 2 }, { row: 1, col: 3 }], animalType: null, animalCount: 0 },
      ]
    })
    const before = undoRuleSnapshot(session.getState())
    let response = accept(session, play(session, 'A001_Shelter'))
    const tile = { row: 0, col: 2 }
    const selection = requireWait(response)
    assert.ok(selection.request.kind === 'farm-select' && selection.request.farm.farmType === 'stable')
    assert.equal(selection.playerIndex, 0)
    assert.ok(selection.request.farm.selectableTiles.some(candidate => candidate.row === tile.row && candidate.col === tile.col))
    assert(response.state.players[1]!.minorHand.includes('A001_Shelter'))
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(1, { stables: [tile] }))
    for (const stables of [[tile, tile], [{ row: 1, col: 2 }], [response.state.players[0]!.roomTiles[0]!]]) {
      assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { stables }))
    }
    response = session.commitSelectionChoice(0, { stables: [tile] })
    assert.equal(response.ok, true, response.error)
    assert.deepEqual(response.state.players[0]!.stableTiles, [tile])
    assert.equal(response.state.players[0]!.resources.wood, 0)
    assert(response.state.players[1]!.minorHand.includes('A001_Shelter'))
    assert.equal(response.state.players[0]!.minorPlayed.includes('A001_Shelter'), false)
    assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player', JSON.stringify(response.interaction))
    assert.equal(response.interaction.playerIndex, 0)
    assert.equal(response.state.currentPlayerIndex, 0)
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { stables: [tile] }))
    const undone = session.undoAction()
    assertUndoRestored(before, undone)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)

    accept(session, play(session, 'A001_Shelter'))
    const retry = session.commitSelectionChoice(0, { stables: [tile] })
    assert.equal(retry.ok, true, retry.error)
    assert.deepEqual(retry.state.players[0]!.stableTiles, [tile])
    assert.equal(retry.state.players[0]!.resources.wood, 0)
    assert(retry.state.players[1]!.minorHand.includes('A001_Shelter'))
    assert.ok(retry.interaction.stateId === 'wait' && retry.interaction.request.kind === 'confirm-next-player', JSON.stringify(retry.interaction))
    assert.equal(retry.interaction.playerIndex, 0)
    assert.equal(retry.state.currentPlayerIndex, 0)
  })

  it("Shelter cannot build a fifth stable when all four pieces are used", () => {
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
  })
})
