import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { ActionChoiceOption, ActionSpace, Resource } from '../../shared/contract/types'
import '../../shared/cards/B/B24_Lasso'

const CARD_ID = 'B24_Lasso'
const MARKET_SPACES = ['sheep-market', 'pig-market', 'cattle-market']

const resources = (values: Partial<Resource> = {}): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
  ...values,
})

const setup = () => {
  const session = new GameSession(undefined, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'

  for (const player of state.players) {
    setWorkersAtHome(state, player, 2)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }

  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.resources = resources()
  player.pastures = [
    {
      id: 'p1',
      size: 4,
      tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
      stables: 1,
      animalType: null,
      animalCount: 0,
    },
  ]

  for (const space of state.actionSpaces) {
    space.takenBy = []
    space.roundAvailable = Math.min(space.roundAvailable, 14)
  }

  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.resources.wood = 3
  state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 0
  state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = 0
  state.actionSpaces.find((space) => space.id === 'cattle-market')!.resources.cattle = 0
  session.loadState(state)
  return session
}

const waitOptions = (resp: ReturnType<GameSession['getState']>): ActionChoiceOption[] => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return []
  expect(resp.interaction.request.kind).toBe('choice')
  return resp.interaction.options ?? []
}

const acceptOptional = (session: GameSession, resp: ReturnType<GameSession['getState']>) => {
  const accept = waitOptions(resp).find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  return session.resolveChoice(0, accept!.value)
}

const placedSpaces = (session: GameSession) =>
  session.getState().state.actionSpaces
    .filter((space) => space.takenBy.some((worker) => worker.playerId === 'p1'))
    .map((space) => space.id)

describe('B24_Lasso session', () => {
  it('after a non-market first placement offers only animal markets for the second placement', () => {
    const session = setup()

    let resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(waitOptions(resp).map((option) => option.value)).toContain('__skip__')

    resp = acceptOptional(session, resp)
    const options = waitOptions(resp).map((option) => option.value)

    expect(options).toEqual(MARKET_SPACES)
  })

  it('after an animal-market first placement offers any legal second target and runs target action flow', () => {
    const session = setup()

    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.ok).toBe(true)
    resp = acceptOptional(session, resp)

    const options = waitOptions(resp).map((option) => option.value)
    expect(options).toContain('forest')
    expect(options).toContain('farmland')

    resp = session.resolveChoice(0, 'forest')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(3)
    expect(resp.state.actionSpaces.find((space: ActionSpace) => space.id === 'forest')!.resources.wood).toBe(0)
  })

  it('skip keeps only the first placement', () => {
    const session = setup()

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    const skipped = session.resolveChoice(0, '__skip__')

    expect(skipped.ok).toBe(true)
    expect(placedSpaces(session)).toEqual(['forest'])
  })

  it('does not recursively trigger from the second placement', () => {
    const session = setup()

    let resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    resp = acceptOptional(session, resp)
    resp = session.resolveChoice(0, 'sheep-market')

    expect(resp.ok).toBe(true)
    expect(placedSpaces(session).sort()).toEqual(['forest', 'sheep-market'])
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'choice') {
      expect(resp.interaction.options?.map((option) => option.value)).not.toContain('__skip__')
    }
  })
})
