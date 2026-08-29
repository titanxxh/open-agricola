import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import '../../shared/cards/C/C108_Layabout'
import '../../shared/cards/E/E117_PipeSmoker'

const CARD_ID = 'C108_Layabout'

const setupHarvest = (round: number) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = round
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  state.players[0]!.startPlayer = true
  state.players[1]!.startPlayer = false
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 1)
    player.resources.food = 5
    player.resources.grain = 0
    player.resources.wood = 0
  })
  return { session, state }
}

const addHarvestFarm = (state: ReturnType<typeof setupHarvest>['state'], playerIndex: number) => {
  const player = state.players[playerIndex]!
  player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }]
  player.pastures = [{
    id: `p${playerIndex + 1}-pasture`,
    size: 2,
    tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
    stables: 0,
    animalType: 'sheep',
    animalCount: 2,
  }]
  player.resources.sheep = 2
}

describe('C108_Layabout session', () => {
  it('skips the owner\'s whole next harvest while other players harvest normally', () => {
    const { session, state } = setupHarvest(4)
    addHarvestFarm(state, 0)
    addHarvestFarm(state, 1)
    session.devPlayCard(0, CARD_ID)
    session.devPlayCard(0, 'E117_PipeSmoker')

    expect(state.players[0]!.cardStates[CARD_ID]?.extraData?.skipNextHarvest).toBe(true)

    const resp = autoAdvanceRoundEnd(session)
    const skipped = resp.state.players[0]!
    const participant = resp.state.players[1]!

    expect(skipped.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(skipped.resources).toMatchObject({ food: 5, grain: 0, wood: 0, sheep: 2, begging: 0 })
    expect(skipped.pastures[0]!.animalCount).toBe(2)
    expect(skipped.cardStates[CARD_ID]?.extraData).toMatchObject({ skipHarvestRound: 4 })
    expect(skipped.cardStates[CARD_ID]?.extraData?.skipNextHarvest).toBeUndefined()

    expect(participant.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(participant.resources).toMatchObject({ food: 3, grain: 1, sheep: 3, begging: 0 })
  })

  it('does not reuse a skip marker from an earlier harvest', () => {
    const { session, state } = setupHarvest(7)
    addHarvestFarm(state, 0)
    state.players[0]!.occupationPlayed.push(CARD_ID)
    state.players[0]!.cardStates[CARD_ID] = { extraData: { skipHarvestRound: 4 } }

    const resp = autoAdvanceRoundEnd(session)
    const player = resp.state.players[0]!

    expect(player.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(player.resources).toMatchObject({ food: 3, grain: 1, sheep: 3, begging: 0 })
  })
})
