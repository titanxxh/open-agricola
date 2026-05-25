import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'

import '../../shared/cards/E/E10_StrawHat'

const CARD_ID = 'E10_StrawHat'

const setupRoundEnd = () => {
  const session = new GameSession(undefined, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 3
  state.roundPhase = 'work'

  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.occupationHand = ['A116_WoodCutter']
  player.resources.food = 5
  player.minorHand = ['__test_placeholder__']

  const opponent = state.players[1]!
  opponent.minorHand = ['__test_placeholder__']
  opponent.occupationHand = ['__test_placeholder__']

  const farmland = state.actionSpaces.find((space) => space.id === 'farmland')!
  farmland.takenBy = [{ playerId: player.id, workerId: '1' }]
  markAllWorkersUsed(state, player)
  markAllWorkersUsed(state, opponent)

  session.loadState(state)
  return session
}

describe('E10_StrawHat session', () => {
  it('choosing food gains exactly 1 food', () => {
    const session = setupRoundEnd()
    const beforeFood = session.getState().state.players[0]!.resources.food

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected StrawHat choice')
    expect(resp.interaction.options?.some(option => option.value === '__skip__')).toBe(false)

    resp = session.resolveChoice(0, resp.interaction.options![0]!.value)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(beforeFood + 1)
  })

  it('choosing move clears Farmland and resolves the target action flow', () => {
    const session = setupRoundEnd()

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected StrawHat choice')

    resp = session.resolveChoice(0, resp.interaction.options![1]!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected move target choice')

    const lessonsOption = resp.interaction.options?.find(option => option.value === 'lessons')
    expect(lessonsOption).toBeDefined()
    resp = session.resolveChoice(0, lessonsOption!.value)

    const farmland = resp.state.actionSpaces.find((space) => space.id === 'farmland')!
    expect(farmland.takenBy).toEqual([])
    expect(resp.state.players[0]!.occupationPlayed).toContain('A116_WoodCutter')
    expect(resp.interaction.stateId).toBe('idle')
  })
})
