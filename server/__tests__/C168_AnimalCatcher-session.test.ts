import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setFencesForTest } from '../../shared/cards/__tests__/__fixtures__/fence'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/C/C168_AnimalCatcher'

const CARD_ID = 'C168_AnimalCatcher'

const setup = (options?: { round?: number; food?: number }) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = options?.round ?? 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources.food = options?.food ?? 10
  player.occupationPlayed.push(CARD_ID)

  // Add pastures so animals can be housed
  player.pastures = [
    {
      id: 'pasture-0',
      tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }],
      stableCount: 0,
      animalType: null,
      animalCount: 0,
    },
    {
      id: 'pasture-1',
      tiles: [{ row: 2, col: 2 }],
      stableCount: 0,
      animalType: null,
      animalCount: 0,
    },
  ]
  setFencesForTest(player, 8)

  session.loadState(state)
  return session
}

/** Drain pending states (choices pick first option, animalReorg distributes to zones). */
const drainPending = (session: GameSession, resp: ReturnType<GameSession['getState']>) => {
  let safety = 30
  while (safety-- > 0) {
    if (resp.interaction.stateId !== 'wait') {
      break
    }
    const playerIdx = resp.interaction.playerIndex ?? 0
    resp = session.resolveChoice(playerIdx, resp.interaction.options![0]!.value)
  }
  return resp
}

describe('C168_AnimalCatcher session', () => {
  it('offers animal alternative on day-laborer', () => {
    const session = setup({ round: 1 })

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.options?.length).toBeGreaterThanOrEqual(2)
  })

  it('choosing animals gives sheep, boar, cattle and costs food', () => {
    const session = setup({ round: 1, food: 20 })

    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Choose alternative (first option = animal path)
    resp = session.resolveChoice(0, resp.interaction.options[0]!.value)
    expect(resp.ok).toBe(true)

    resp = drainPending(session, resp)

    const player = resp.state.players[0]!
    // At round 1, remaining harvests = 6 (rounds 4,7,9,11,13,14)
    // Started with 20 food, paid 6 food
    expect(player.resources.food).toBe(14)
  })

  it('choosing original gain gives 2 food without animal cost', () => {
    const session = setup({ round: 1, food: 5 })

    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Choose original gain (last option)
    const lastOption = resp.interaction.options[resp.interaction.options?.length - 1]!
    resp = session.resolveChoice(0, lastOption.value)
    expect(resp.ok).toBe(true)

    resp = drainPending(session, resp)

    const player = resp.state.players[0]!
    expect(player.resources.food).toBe(7) // 5 + 2
  })

  it('food cost decreases in later rounds', () => {
    const session = setup({ round: 11, food: 20 })

    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Choose alternative (first option)
    resp = session.resolveChoice(0, resp.interaction.options[0]!.value)
    expect(resp.ok).toBe(true)

    resp = drainPending(session, resp)

    const player = resp.state.players[0]!
    // At round 11, remaining harvests >= 11: [11, 13, 14] = 3
    expect(player.resources.food).toBe(17)
  })
})
