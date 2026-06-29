import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { AnytimeAction, Resource } from '../../shared/contract/types'

import '../../shared/cards/M/M084_BogPony'

const CARD_ID = 'M084_BogPony'
const ANYTIME_ID = 'M084-bog-pony-anytime'
const PLACEHOLDER = '__test_placeholder__'

const fullResources = (overrides: Partial<Resource> = {}): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  horse: 0,
  fuel: 0,
  begging: 0,
  ...overrides,
})

const anytimeIds = (session: GameSession): string[] =>
  session.getState().interaction.anytimeActions.map((action: AnytimeAction) => action.id)

const enterActiveInteraction = (session: GameSession) => {
  const resp = session.takeAction(0, 'farmland')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  return resp.interaction.anytimeActions.map((action: AnytimeAction) => action.id)
}

const setup = () => {
  const session = new GameSession(84, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  for (const player of state.players) {
    player.resources = fullResources()
    player.minorHand = [PLACEHOLDER]
    player.occupationHand = [PLACEHOLDER]
    player.improvements = []
    player.minorPlayed = []
    player.occupationPlayed = []
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.stableAnimals = {}
    player.cardStates = {}
  }
  const player = state.players[0]!
  player.minorPlayed = [CARD_ID]
  player.cardStates = { [CARD_ID]: { extraData: { animalCounts: { horse: 0 } } } }
  session.loadState(state)
  return session
}

describe('M084 Bog Pony session', () => {
  it('does not offer anytime when no standing horse is placed', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.resources = fullResources({ horse: 1 })
    session.loadState(state)

    expect(enterActiveInteraction(session)).not.toContain(ANYTIME_ID)
    expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
  })

  it('lies a placed standing horse on the card for 2 fuel without reducing total horses', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources = fullResources({ horse: 1, fuel: 0 })
    player.pastures = [{
      id: 'horse-pasture',
      size: 1,
      tiles: [{ row: 1, col: 0 }],
      stables: 0,
      animalType: 'horse',
      animalCount: 1,
    }]
    session.loadState(state)

    expect(enterActiveInteraction(session)).toContain(ANYTIME_ID)

    const resp = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(resp.ok).toBe(true)
    const updated = resp.state.players[0]!
    expect(updated.resources.fuel).toBe(2)
    expect(updated.resources.horse).toBe(1)
    expect(updated.pastures[0]).toMatchObject({ animalType: null, animalCount: 0 })
    expect(updated.cardStates[CARD_ID]?.extraData?.animalCounts).toMatchObject({ horse: 1 })
    expect(resp.interaction.anytimeActions.map((action: AnytimeAction) => action.id)).not.toContain(ANYTIME_ID)
  })
})
