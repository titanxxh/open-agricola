import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/B/B138_ForestGuardian'

const CARD_ID = 'B138_ForestGuardian'
const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  played = true, actor = 0, actorFood = 0, forestWood = 5,
}: {
  played?: boolean
  actor?: number
  actorFood?: number
  forestWood?: number
} = {}) => {
  const session = new GameSession(6138, undefined, { playerCount: 3 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = actor
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  state.players[actor]!.resources.food = actorFood
  state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = forestWood
  state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed = 5
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait'
    && response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return resolveTriggerIfPresent(session, response, CARD_ID)
}

const settleCrossPlayerTrigger = (session: GameSession, initial: SessionResponse) => {
  let response = resolveTriggerIfPresent(session, initial, CARD_ID)
  for (let remaining = 8; remaining > 0
    && response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'confirm-player-switch'; remaining -= 1) {
    response = confirmPlayerSwitch(session)
    response = resolveTriggerIfPresent(session, response, CARD_ID)
  }
  return response
}

describe('B138 Forest Guardian parity', () => {
  it('B138 S1: playing Forest Guardian immediately gains two wood', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })

  it('B138 S2: an opponent pays one food before taking five wood from Forest', () => {
    const session = setup({ actor: 1, actorFood: 1 })

    const response = settleCrossPlayerTrigger(session, session.takeAction(1, 'forest'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[1]!.resources).toMatchObject({ food: 0, wood: 5 })
  })

  it('B138 S3: taking only four wood requires no Forest Guardian payment', () => {
    const session = setup({ actor: 1, actorFood: 1, forestWood: 4 })

    const response = settleCrossPlayerTrigger(session, session.takeAction(1, 'forest'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[1]!.resources).toMatchObject({ food: 1, wood: 4 })
  })

  it('B138 S4: the owner taking five wood pays nobody', () => {
    const session = setup()

    const response = settleCrossPlayerTrigger(session, session.takeAction(0, 'forest'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 5 })
  })

  it('B138 S5: an opponent taking a non-wood accumulation pays nothing', () => {
    const session = setup({ actor: 1, actorFood: 1 })

    const response = settleCrossPlayerTrigger(session, session.takeAction(1, 'reed-bank'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[1]!.resources).toMatchObject({ food: 1, reed: 5 })
  })

  it('B138 S6: an unpaid mandatory transfer cannot credit the owner or complete collecting', () => {
    const session = setup({ actor: 1, actorFood: 0 })

    const response = settleCrossPlayerTrigger(session, session.takeAction(1, 'forest'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[1]!.resources).toMatchObject({ food: 0, wood: 0 })
    expect(response.interaction.request.kind).toBe('engine-blocked')
    const undone = session.undoStep(1)
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources.food).toBe(0)
    expect(undone.state.players[1]!.resources).toMatchObject({ food: 0, wood: 0 })
    expect(undone.state.actionSpaces.find((space) => space.id === 'forest')).toMatchObject({
      resources: { wood: 5 }, takenBy: [],
    })
  })
})
