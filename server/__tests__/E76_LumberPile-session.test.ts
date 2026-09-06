import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E076_LumberPile'
import '../../shared/cards/B/B085_FarmHand'

const CARD_ID = 'E076_LumberPile'
const FARM_HAND = 'B085_FarmHand'
const FILLER = '__test_placeholder__'

type Position = { row: number; col: number }

const setup = ({
  normalStables = [], farmHand = false, wood = 0,
}: {
  normalStables?: Position[]
  farmHand?: boolean
  wood?: number
} = {}) => {
  const session = new GameSession(7076, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.stableTiles = []
    Object.assign(player.resources, {
      wood: index === 0 ? wood : 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.minorHand = [CARD_ID]
  owner.stableTiles = normalStables
  if (farmHand) {
    owner.occupationPlayed = [FARM_HAND]
    owner.cardStates[FARM_HAND] = {
      flagged: true,
      extraData: { position: { row: 2, col: 4 } },
    }
  }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const play = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let safety = 0; safety < 20 && response.state.players[0]!.minorHand.includes(CARD_ID); safety += 1) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') break
    const next = options(response).find((option) => option.value === CARD_ID)
      ?? options(response).find((option) => option.value !== '__skip__' && option.value !== 'cancel')
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}

const enterSelection = (session: GameSession, response: SessionResponse) => {
  let current = response
  for (let safety = 0; safety < 5; safety += 1) {
    if (current.interaction.stateId !== 'wait') return current
    if (current.interaction.request.kind === 'selection') return current
    const next = options(current).find((option) =>
      option.sourceCard === CARD_ID && option.value !== '__skip__')
      ?? options(current).find((option) => option.value.startsWith('flow-'))
    if (!next) return current
    current = session.resolveChoice(current.interaction.playerIndex, next.value)
  }
  return current
}

const playToSelection = (session: GameSession) => enterSelection(session, play(session))

const commitPositions = (session: GameSession, positions: Position[]) =>
  session.commitSelectionChoice(0, { positions })

const stablePositions = (response: SessionResponse) => response.state.players[0]!.stableTiles
  .map(({ row, col }) => ({ row, col }))
  .sort((left, right) => left.row - right.row || left.col - right.col)

const hasFarmHand = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[FARM_HAND]?.extraData?.position !== undefined

const expectSelection = (response: SessionResponse, maxSelections: number) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait',
    sourceCard: CARD_ID,
    request: { kind: 'selection' },
  })
  if (response.interaction.stateId !== 'wait') return
  expect(response.interaction.request.selection?.maxSelections).toBe(maxSelections)
}

describe('E076 Lumber Pile parity', () => {
  it('E076 S1: Lumber Pile is free to play and with no stable grants no wood or prompt', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })

  it('E076 S2: returning one normal stable gains three wood', () => {
    const session = setup({ normalStables: [{ row: 0, col: 2 }] })
    const selection = playToSelection(session)
    expectSelection(selection, 1)

    const response = commitPositions(session, [{ row: 0, col: 2 }])

    expect(response.ok, response.error).toBe(true)
    expect(stablePositions(response)).toEqual([])
    expect(response.state.players[0]!.resources.wood).toBe(3)
  })

  it('E076 S3: returning three of four normal stables gains nine wood and leaves one', () => {
    const session = setup({ normalStables: [
      { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 },
    ] })
    const selection = playToSelection(session)
    expectSelection(selection, 3)

    const response = commitPositions(session, [
      { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 },
    ])

    expect(response.ok, response.error).toBe(true)
    expect(stablePositions(response)).toEqual([{ row: 0, col: 4 }])
    expect(response.state.players[0]!.resources.wood).toBe(9)
  })

  it('E076 S4: declining Lumber Pile returns no stable and gains no wood', () => {
    const session = setup({ normalStables: [{ row: 0, col: 2 }] })
    let response = play(session)
    expect(options(response).some((option) => option.value === '__skip__')).toBe(true)

    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(stablePositions(response)).toEqual([{ row: 0, col: 2 }])
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('E076 S5: rejects a nonexistent stable coordinate and fully rolls back', () => {
    const session = setup({ normalStables: [{ row: 0, col: 2 }] })
    playToSelection(session)
    const before = JSON.parse(JSON.stringify(session.getState()))

    const response = commitPositions(session, [{ row: 2, col: 4 }])

    expect(response.ok).toBe(false)
    expect(response.error).toBe('invalid selection position')
    expect(JSON.parse(JSON.stringify(session.getState()))).toEqual(before)
  })

  it('E076 S6: rejects a duplicate stable coordinate and fully rolls back', () => {
    const session = setup({ normalStables: [{ row: 0, col: 2 }] })
    playToSelection(session)
    const before = JSON.parse(JSON.stringify(session.getState()))

    const response = commitPositions(session, [{ row: 0, col: 2 }, { row: 0, col: 2 }])

    expect(response.ok).toBe(false)
    expect(response.error).toBe('duplicate selection position')
    expect(JSON.parse(JSON.stringify(session.getState()))).toEqual(before)
  })

  it('E076 S7: selecting more than three normal stables is rejected atomically', () => {
    const session = setup({ normalStables: [
      { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 },
    ] })
    playToSelection(session)
    const before = JSON.parse(JSON.stringify(session.getState()))

    const response = commitPositions(session, [
      { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 },
    ])

    expect(response.ok).toBe(false)
    expect(response.error).toBe('too many selection positions')
    expect(JSON.parse(JSON.stringify(session.getState()))).toEqual(before)
  })

  it('E076 S8: returning Farm Hand and two normal stables gains nine wood', () => {
    const session = setup({
      normalStables: [{ row: 0, col: 1 }, { row: 0, col: 2 }], farmHand: true,
    })
    const selection = playToSelection(session)
    expectSelection(selection, 3)

    const response = commitPositions(session, [
      { row: 2, col: 4 }, { row: 0, col: 1 }, { row: 0, col: 2 },
    ])

    expect(response.ok, response.error).toBe(true)
    expect(hasFarmHand(response)).toBe(false)
    expect(stablePositions(response)).toEqual([])
    expect(response.state.players[0]!.resources.wood).toBe(9)
  })

  it('E076 S9: selecting three normal stables keeps Farm Hand and gains nine wood', () => {
    const session = setup({
      normalStables: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }],
      farmHand: true,
    })
    const selection = playToSelection(session)
    expectSelection(selection, 3)

    const response = commitPositions(session, [
      { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 },
    ])

    expect(response.ok, response.error).toBe(true)
    expect(hasFarmHand(response)).toBe(true)
    expect(stablePositions(response)).toEqual([])
    expect(response.state.players[0]!.resources.wood).toBe(9)
  })

  it('E076 S10: returning Farm Hand alone gains three wood and removes its room capacity', () => {
    const session = setup({ farmHand: true })
    expect(getExtraRoomCapacity(session.state.players[0]!)).toBe(1)
    const selection = playToSelection(session)
    expectSelection(selection, 1)

    const response = commitPositions(session, [{ row: 2, col: 4 }])

    expect(response.ok, response.error).toBe(true)
    expect(hasFarmHand(response)).toBe(false)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(getExtraRoomCapacity(response.state.players[0]!)).toBe(0)
  })
})
