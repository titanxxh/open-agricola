import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A161_PatchCaretaker'

const CARD_ID = 'A161_PatchCaretaker'

const FILLER = '__test_placeholder__'

const setup = ({ played = true, actor = 0 }: { played?: boolean; actor?: number } = {}) => {
  const session = new GameSession(6161, undefined, { playerCount: 4 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  for (const [id, type] of [
    ['forest', 'wood'], ['grove', 'wood'], ['clay-pit', 'clay'], ['reed-bank', 'reed'],
    ['fishing', 'food'], ['traveling-players', 'food'],
  ] as const) {
    const space = state.actionSpaces.find((candidate) => candidate.id === id)
    if (!space) throw new Error(`missing ${id}`)
    space.resources[type] = 1
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const takeAndConfirm = (session: GameSession, actor: number, actionId: string): SessionResponse => {
  let response = session.takeAction(actor, actionId)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'confirm-next-player' },
  })
  if (response.interaction.stateId !== 'wait') return response
  response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
  return response
}

describe('A161 Patch Caretaker parity', () => {
  it('A161 S1: Patch Caretaker is played as the first occupation in a four-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A161 S2: the owners second wood accumulation space in one work phase gains one vegetable', () => {
    const session = setup()
    takeAndConfirm(session, 0, 'forest')
    takeAndConfirm(session, 1, 'clay-pit')
    takeAndConfirm(session, 2, 'day-laborer')
    takeAndConfirm(session, 3, 'fishing')

    const response = session.takeAction(0, 'grove')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
  })

  it('A161 S3: two owner accumulation spaces for different goods grant no vegetable', () => {
    const session = setup()
    takeAndConfirm(session, 0, 'forest')
    takeAndConfirm(session, 1, 'reed-bank')
    takeAndConfirm(session, 2, 'fishing')
    takeAndConfirm(session, 3, 'traveling-players')

    const response = session.takeAction(0, 'clay-pit')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('A161 S4: the owners first accumulation space grants no vegetable', () => {
    const response = setup().takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('A161 S5: an opponents earlier wood accumulation does not count for the owner', () => {
    const session = setup({ actor: 1 })
    takeAndConfirm(session, 1, 'forest')
    takeAndConfirm(session, 2, 'clay-pit')
    takeAndConfirm(session, 3, 'day-laborer')

    const response = session.takeAction(0, 'grove')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })
})
