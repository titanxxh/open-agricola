import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/E/E089_Stallwright'

const CARD_ID = 'E089_Stallwright'

const TARGET = 'A116_WoodCutter'

const FILLER = '__test_placeholder__'

const PRIORS = [
  'B121_Geologist', 'C123_Freemason', 'D122_ClayCarrier',
  'E142_Smuggler', 'A100_Curator',
]

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({ triggerCount = 1, selfPlayed = true } = {}) => {
  const session = new GameSession(6089 + triggerCount, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.stableTiles = []
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  if (selfPlayed) {
    owner.occupationPlayed = triggerCount === 2 ? [TARGET] : []
    owner.occupationHand = [CARD_ID]
  } else {
    owner.occupationPlayed = [CARD_ID, ...PRIORS.slice(0, triggerCount - 2)]
    owner.occupationHand = [TARGET]
  }
  session.loadState(state)
  return session
}

const playTarget = (session: GameSession, selfPlayed = false) => {
  const target = selfPlayed ? CARD_ID : TARGET
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(target)) {
    const card = options(response).find((option) => option.value === target)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.stateId === 'wait'
      ? response.interaction.playerIndex
      : 0, card!.value)
  }
  return resolveTriggerIfPresent(session, response, CARD_ID)
}

const buildStable = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind !== 'farm-select') {
    const stable = options(response).find((option) => option.labelKey === 'actions.stables.name')
    expect(stable, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, stable!.value)
  }
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
  })
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'farm-select') return response
  const tile = response.interaction.request.farm.selectableTiles[0]!
  return session.commitSelectionChoice(response.interaction.playerIndex, { stables: [tile] })
}

describe('E089 Stallwright parity', () => {
  it('E089 S1: playing Stallwright as the first occupation gives no stable', () => {
    const response = playTarget(setup(), true)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.stableTiles).toHaveLength(0)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })

  it('E089 S2: playing Stallwright as the second occupation may build one free stable', () => {
    const session = setup({ triggerCount: 2 })
    const response = buildStable(session, playTarget(session, true))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  for (const [scenario, triggerCount] of [
    ['S3', 3],
    ['S5', 5],
    ['S6', 7],
  ] as const) {
    it(`E089 ${scenario}: playing occupation ${triggerCount} may build one free stable`, () => {
      const session = setup({ triggerCount, selfPlayed: false })
      const response = buildStable(session, playTarget(session))

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.stableTiles).toHaveLength(1)
      expect(response.state.players[0]!.resources.wood).toBe(0)
    })
  }

  it('E089 S4: playing the fourth occupation gives no Stallwright stable', () => {
    const response = playTarget(setup({ triggerCount: 4, selfPlayed: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(0)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })

  it('E089 S7: the optional stable at a trigger count may be declined', () => {
    const session = setup({ triggerCount: 3, selfPlayed: false })
    let response = playTarget(session)
    const skip = options(response).find((option) => option.value === '__skip__')
    expect(skip, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.stateId === 'wait'
      ? response.interaction.playerIndex
      : 0, skip!.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(0)
  })
})
