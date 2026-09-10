import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A051_DriftNetBoat'
import '../../shared/cards/A/A056_Basket'

const FILLER = '__test_placeholder__'

const setup = ({ cardId, played = true, resources = {}, forestWood = 3, fishingFood = 3 }: {
  cardId: string
  played?: boolean
  resources?: Record<string, number>
  forestWood?: number
  fishingFood?: number
}) => {
  const session = new GameSession(7051, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [cardId]
  owner.minorPlayed = played ? [cardId] : []
  Object.assign(owner.resources, resources)
  state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = forestWood
  state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = fishingFood
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 6 && response.state.players[0]!.minorHand.includes(cardId); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) => option.value === cardId)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}

describe('A051 Drift-Net Boat parity', () => {
  const CARD_ID = 'A051_DriftNetBoat'

  it('A051 S1: paying one wood and one reed plays Drift-Net Boat', () => {
    const response = playMinor(setup({ cardId: CARD_ID, played: false, resources: { wood: 1, reed: 1 } }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('A051 S2: Fishing gains its accumulated food plus two additional food', () => {
    const response = setup({ cardId: CARD_ID }).takeAction(0, 'fishing')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(5)
  })

  it('A051 S3: a non-Fishing accumulation space grants no Drift-Net Boat food', () => {
    const response = setup({ cardId: CARD_ID }).takeAction(0, 'forest')
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
})

describe('A056 Basket parity', () => {
  const CARD_ID = 'A056_Basket'

  it('A056 S1: paying one reed plays Basket', () => {
    const response = playMinor(setup({ cardId: CARD_ID, played: false, resources: { reed: 1 } }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.reed).toBe(0)
  })

  const useBasket = (session: GameSession) => {
    const response = resolveTriggerIfPresent(session, session.takeAction(0, 'forest'), CARD_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }

  it('A056 S2: after taking wood, Basket returns two wood to that space and gains three food', () => {
    const response = useBasket(setup({ cardId: CARD_ID }))
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 3 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(2)
  })

  it('A056 S3: the Basket exchange may be declined', () => {
    const session = setup({ cardId: CARD_ID })
    let response = resolveTriggerIfPresent(session, session.takeAction(0, 'forest'), CARD_ID)
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(0)
  })

  it('A056 S4: taking one wood may combine it with one existing wood for Basket', () => {
    const response = useBasket(setup({ cardId: CARD_ID, resources: { wood: 1 }, forestWood: 1 }))
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 3 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(2)
  })

  it('A056 S5: a non-wood accumulation space does not offer Basket', () => {
    const session = setup({ cardId: CARD_ID, resources: { wood: 2 }, forestWood: 0 })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 3
    session.loadState(state)
    const response = session.takeAction(0, 'clay-pit')
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, food: 0 })
  })
})
