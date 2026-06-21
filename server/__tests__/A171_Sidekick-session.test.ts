import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { setActiveWorkerCount, workersAvailable } from '../../shared/domain/player'
import '../../shared/cards/A/A171_Sidekick'

const CARD_ID = 'A171_Sidekick'

const setup = (options: { food?: number; workers?: number } = {}) => {
  const session = new GameSession(42, undefined, { playerCount: 5 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 3
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'western-quarry'
  state.roundActionOrder[1] = 'vegetable-seeds'
  state.roundActionOrder[2] = 'eastern-quarry'
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const owner = state.players[0]!
  owner.occupationPlayed.push(CARD_ID)
  owner.resources.food = options.food ?? 2
  owner.resources.stone = 0
  owner.resources.vegetable = 0
  setActiveWorkerCount(owner, options.workers ?? 3)
  for (const id of ['western-quarry', 'eastern-quarry']) {
    const space = state.actionSpaces.find((candidate) => candidate.id === id)!
    space.resources.stone = id === 'western-quarry' ? 2 : 1
  }
  session.loadState(state)
  return session
}

const acceptOption = (resp: ReturnType<GameSession['getState']>) =>
  resp.interaction.stateId === 'wait'
    ? resp.interaction.options?.find((option: ActionChoiceOption) => option.value !== '__skip__')
    : undefined

describe('A171 Sidekick session', () => {
  it('accepts and chains leftward with one food and one worker per step', () => {
    const session = setup()

    let resp = session.takeAction(0, 'eastern-quarry')
    let accept = acceptOption(resp)
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    const afterFirst = resp.state.players[0]!
    expect(afterFirst.resources).toMatchObject({ food: 1, stone: 1, vegetable: 1 })
    expect(workersAvailable(resp.state, afterFirst)).toBe(1)
    expect(resp.state.actionSpaces.find((space) => space.id === 'vegetable-seeds')?.takenBy).toEqual([
      { playerId: afterFirst.id, workerId: '2' },
    ])

    accept = acceptOption(resp)
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    const afterSecond = resp.state.players[0]!
    expect(afterSecond.resources).toMatchObject({ food: 0, stone: 3, vegetable: 1 })
    expect(workersAvailable(resp.state, afterSecond)).toBe(0)
    expect(resp.state.actionSpaces.find((space) => space.id === 'western-quarry')?.takenBy).toEqual([
      { playerId: afterSecond.id, workerId: '3' },
    ])
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-next-player')
  })

  it('declines without paying, placing another worker, or taking the left action', () => {
    const session = setup()

    let resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, '__skip__')

    const owner = resp.state.players[0]!
    expect(owner.resources).toMatchObject({ food: 2, stone: 1, vegetable: 0 })
    expect(workersAvailable(resp.state, owner)).toBe(2)
    expect(resp.state.actionSpaces.find((space) => space.id === 'vegetable-seeds')?.takenBy).toEqual([])
  })
})
