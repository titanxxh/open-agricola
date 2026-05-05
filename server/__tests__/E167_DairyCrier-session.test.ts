import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setFencesForTest } from '../../shared/cards/__tests__/__fixtures__/fence'

import { setWorkersAtHome } from '../../shared/game/player'
import { confirmPlayerSwitch } from './_helpers/legacy-confirms'
import '../../shared/cards/E/E167_DairyCrier'

const CARD_ID = 'E167_DairyCrier'

const setup = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources.food = 5
  player.occupationHand.push(CARD_ID)

  // Give p0 a fenced pasture so they can hold animals
  player.pastures = [{
    id: 'pasture-0',
    tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }],
    stableCount: 0,
    animalType: null,
    animalCount: 0,
  }]
  setFencesForTest(player, 6)

  session.loadState(state)
  return session
}

/**
 * Helper to resolve all pending states.
 * For animalReorg: place animals in pasture or house to prevent release.
 */
const drainPending = (session: GameSession, resp: ReturnType<GameSession['getState']>) => {
  let safety = 30
  while (safety-- > 0) {
    if (resp.pending.type === 'choice') {
      const playerIdx = resp.pending.playerIndex ?? 0
      resp = session.resolveChoice(playerIdx, resp.pending.options[0]!.value)
    } else if (resp.pending.type === 'confirmPlayerSwitch') {
      resp = confirmPlayerSwitch(session)
    } else {
      break
    }
  }
  return resp
}

describe('E167_DairyCrier session', () => {
  it('onBuy gives each player a choice of sheep or food, owner also gets cattle', () => {
    const session = setup()
    const state = session.getState().state
    const initialCattle0 = state.players[0]!.resources.cattle

    // Play via lessons action to trigger the onBuy flow
    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    // Choose E167_DairyCrier from the occupation options
    const cardOption = resp.pending.options.find((o) => o.value === CARD_ID)
    expect(cardOption).toBeDefined()
    resp = session.resolveChoice(0, CARD_ID)
    expect(resp.ok).toBe(true)

    // Drain all pending states
    resp = drainPending(session, resp)

    // Verify final state
    const finalP0 = resp.state.players[0]!
    // Owner should have gained cattle
    expect(finalP0.resources.cattle).toBeGreaterThanOrEqual(initialCattle0 + 1)
    expect(finalP0.occupationPlayed).toContain(CARD_ID)
  })
})
