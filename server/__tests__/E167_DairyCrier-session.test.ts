import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setFencesForTest } from '../../shared/cards/__tests__/__fixtures__/fence'

import { setWorkersAtHome } from '../../shared/domain/player'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import '../../shared/cards/E/E167_DairyCrier'

const CARD_ID = 'E167_DairyCrier'

const setup = () => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources.food = 5
  player.occupationHand = [CARD_ID, 'A085_Homekeeper']

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
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') {
      break
    }
    const playerIdx = resp.interaction.playerIndex ?? 0
    if (resp.interaction.request.kind === 'animal-reorg') {
      const player = resp.state.players[playerIdx]
      const zones = resp.interaction.request.zones.map((zone) =>
        zone.zoneType === 'house' && (player?.resources.cattle ?? 0) > 0
          ? { ...zone, animalType: 'cattle' as const, animalCount: 1 }
          : { ...zone, animalType: null, animalCount: 0 },
      )
      resp = session.resolveChoice(playerIdx, 'confirm', zones)
      continue
    }
    if (resp.interaction.request.kind === 'feed') {
      resp = session.resolveChoice(playerIdx, 'confirm', { selections: [] })
      continue
    }
    if (resp.interaction.request.kind === 'confirm-next-player') {
      resp = session.resolveChoice(resp.interaction.request.nextPlayerIndex, 'confirm')
      continue
    }
    if (resp.interaction.request.kind === 'confirm-player-switch') {
      resp = session.resolveChoice(resp.interaction.request.fromPlayerIndex, 'confirm')
      continue
    }
    const options = resp.interaction.request.kind === 'choice' || resp.interaction.request.kind === 'select-trigger'
      ? resp.interaction.request.options
      : []
    const option = options.find((entry) =>
      'effectPreview' in entry && entry.effectPreview?.resourcesGained?.food === 2,
    ) ?? options[0]
    if (!option) break
    resp = session.resolveChoice(playerIdx, option.value)
  }
  expect(resp.interaction.stateId).not.toBe('wait')
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
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Choose E167_DairyCrier from the occupation options
    const cardOption = resp.interaction.request.kind === 'choice'
      ? resp.interaction.request.options.find((o) => o.value === CARD_ID)
      : undefined
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
    expect(readCardResourceStats(finalP0, CARD_ID)?.gained).toMatchObject({ cattle: 1, food: 2 })
    expect(resp.state.players[1]!.stats.resourcesFromCards.food).toBe(2)
  })
})
