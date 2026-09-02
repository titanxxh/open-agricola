import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B002_MiniPasture'

const CARD_ID = 'B002_MiniPasture'

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const setup = ({ food = 2, existing = false } = {}) => {
  const session = new GameSession(2, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 3
  state.availableMajorImprovements = []
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  player.resources = { ...player.resources, food, wood: 0 }
  if (existing) {
    player.fenceSegments = edgesForTile(0, 0).map((edge) => ({ edge, type: 'fence' as const }))
    player.pastures = [{
      id: 'pasture-1',
      size: 1,
      tiles: [{ row: 0, col: 0 }],
      stables: 0,
      animalType: null,
      animalCount: 0,
    }]
  }
  session.loadState(state)
  return session
}

const play = (session: GameSession) => {
  let response: SessionResponse = session.takeAction(0, 'major-improvement')
  for (let step = 0; step < 3 && response.state.players[0]!.minorHand.includes(CARD_ID); step++) {
    if (response.interaction.stateId !== 'wait') break
    const option = response.interaction.request.options?.find((candidate) =>
      candidate.value === CARD_ID || candidate.value.startsWith('action-improvement-')
    )
    if (!option) break
    response = session.resolveChoice(0, option.value)
  }
  return response
}

describe('B002 Mini Pasture parity', () => {
  it('B002 S1: Mini Pasture fences one space for no wood and passes', () => {
    const session = setup()
    const pending = play(session)
    expect(pending.interaction.stateId).toBe('wait')

    const response = session.commitSelectionChoice(0, {
      edges: edgesForTile(0, 0),
      extraWood: 0,
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0 })
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('B002 S2: less than two food keeps Mini Pasture unavailable', () => {
    const response = play(setup({ food: 1 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0 })
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })

  it('B002 S3: with an existing pasture the free new pasture must be adjacent', () => {
    const rejectedSession = setup({ existing: true })
    play(rejectedSession)
    const rejected = rejectedSession.commitSelectionChoice(0, {
      edges: edgesForTile(2, 4),
      extraWood: 0,
    })
    expect(rejected.ok).toBe(false)

    const acceptedSession = setup({ existing: true })
    play(acceptedSession)
    const accepted = acceptedSession.commitSelectionChoice(0, {
      edges: edgesForTile(0, 1).filter((edge) => edge !== 'V-0-1'),
      extraWood: 0,
    })

    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.pastures).toHaveLength(2)
    expect(accepted.state.players[0]!.fenceSegments).toHaveLength(7)
    expect(accepted.state.players[0]!.resources.wood).toBe(0)
  })

  it('B002 S4: Mini Pasture rejects a two-space pasture', () => {
    const session = setup()
    play(session)

    const response = session.commitSelectionChoice(0, {
      edges: [
        'H-0-0', 'H-1-0',
        'H-0-1', 'H-1-1',
        'V-0-0', 'V-0-2',
      ],
      extraWood: 0,
    })

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })
})
