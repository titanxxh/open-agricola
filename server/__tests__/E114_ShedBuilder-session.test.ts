import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { getStableCountForCards } from '../../shared/domain/stables'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B085_FarmHand'
import '../../shared/cards/E/E114_ShedBuilder'

const CARD_ID = 'E114_ShedBuilder'
const FARM_HAND_ID = 'B085_FarmHand'
const FILLER = '__test_placeholder__'
const PRIOR_STABLES = [
  { row: 0, col: 2 },
  { row: 0, col: 3 },
  { row: 0, col: 4 },
  { row: 1, col: 2 },
]

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  played = true, priorStables = 0, actor = 0, farmHand = false,
}: {
  played?: boolean
  priorStables?: number
  actor?: number
  farmHand?: boolean
} = {}) => {
  const session = new GameSession(7114, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.stableTiles = []
    Object.assign(player.resources, {
      wood: index === actor ? 10 : 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  const builder = state.players[actor]!
  builder.stableTiles = PRIOR_STABLES.slice(0, priorStables)
  if (farmHand) {
    builder.occupationPlayed.push(FARM_HAND_ID)
    builder.cardStates[FARM_HAND_ID] = {
      flagged: true,
      extraData: { position: { row: 2, col: 4 } },
    }
  }
  session.loadState(state)
  return session
}

const settleShedBuilder = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let step = 0; step < 6 && response.interaction.stateId === 'wait'; step += 1) {
    if (response.interaction.request.kind === 'confirm-next-player'
      || response.interaction.request.kind === 'confirm-player-switch') break
    const choice = optionsOf(response).find((option) =>
      (option.sourceCard === CARD_ID || option.value === CARD_ID)
        && option.value !== '__skip__')
    if (!choice) break
    response = session.resolveChoice(response.interaction.playerIndex, choice.value)
  }
  return response
}

const playShedBuilder = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait'
    && response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    const card = optionsOf(response).find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return settleShedBuilder(session, response)
}

const buildStables = (session: GameSession, actor: number, count: number) => {
  let response = session.takeAction(actor, 'farm-expansion')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind !== 'farm-select') {
    const stableMode = optionsOf(response).find((option) =>
      option.labelKey === 'actions.stables.name')
    expect(stableMode, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, stableMode!.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.farm.farmType).toBe('stable')
  if (response.interaction.request.farm.farmType !== 'stable') return response
  const stables = response.interaction.request.farm.selectableTiles.slice(0, count)
  expect(stables).toHaveLength(count)
  response = session.commitSelectionChoice(actor, { stables })
  return settleShedBuilder(session, response)
}

describe('E114 Shed Builder parity', () => {
  it('E114 S1: playing Shed Builder gives no rewards for stables already built', () => {
    const response = playShedBuilder(setup({ played: false, priorStables: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
  })

  for (const { scenario, priorStables, expected } of [
    { scenario: 'S2', priorStables: 0, expected: { grain: 1, vegetable: 0 } },
    { scenario: 'S3', priorStables: 1, expected: { grain: 1, vegetable: 0 } },
    { scenario: 'S4', priorStables: 2, expected: { grain: 0, vegetable: 1 } },
    { scenario: 'S5', priorStables: 3, expected: { grain: 0, vegetable: 1 } },
  ]) {
    it(`E114 ${scenario}: building stable ${priorStables + 1} grants its ordinal crop`, () => {
      const response = buildStables(setup({ priorStables }), 0, 1)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject(expected)
      expect(getStableCountForCards(response.state.players[0]!)).toBe(priorStables + 1)
    })
  }

  it('E114 S6: building the second and third stables together gains one grain and one vegetable', () => {
    const response = buildStables(setup({ priorStables: 1 }), 0, 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1 })
    expect(getStableCountForCards(response.state.players[0]!)).toBe(3)
  })

  it('E114 S7: a built Farm Hand stable counts when locating the next stable ordinal', () => {
    const response = buildStables(setup({ priorStables: 1, farmHand: true }), 0, 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 1 })
    expect(getStableCountForCards(response.state.players[0]!)).toBe(3)
  })

  it('E114 S8: an opponent building a stable grants the Shed Builder owner no crops', () => {
    const response = buildStables(setup({ actor: 1 }), 1, 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
    expect(response.state.players[1]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
  })
})
