import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/B/B034_SpecialFood'
import '../../shared/cards/B/B012_Stockyard'
import '../../shared/cards/M/M033_NightPasture'

const CARD_ID = 'B034_SpecialFood'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, existingSheep = 0, marketSheep = 2, used = false,
} = {}) => {
  const session = new GameSession(6034, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.pastures = []
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources.sheep = existingSheep
  owner.houseAnimalType = existingSheep > 0 ? 'sheep' : null
  owner.houseAnimalCount = existingSheep
  owner.pastures = played ? [{
    id: 'sheep-pasture', size: 1, tiles: [{ row: 0, col: 1 }],
    stables: 0, animalType: null, animalCount: 0,
  }] : []
  if (played && used) owner.cardStates[CARD_ID] = { flagged: true }
  state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = marketSheep
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = options(response).find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

const takeSheep = (session: GameSession, kept: number) => {
  let response = session.takeAction(0, 'sheep-market')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'animal-reorg' },
  })
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'animal-reorg') return response
  response = session.resolveChoice(response.interaction.playerIndex, 'confirm', {
    zones: kept > 0 ? [{
      id: 'sheep-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: kept,
    }] : [],
  })
  expect(response.ok, response.error).toBe(true)
  return resolveTriggerIfPresent(session, response, CARD_ID)
}

const bonusVp = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0

describe('B034 Special Food parity', () => {
  it.each(['card', 'hosted', 'reserve', 'opponents-hosted'])(
    'uses animal ownership and placement for the %s prerequisite', (location) => {
      const session = setup({ played: false })
      const state = session.getState().state
      const player = state.players[0]!
      const other = state.players[1]!
      player.resources.sheep = location === 'opponents-hosted' ? 0 : 1
      if (location === 'card') {
        player.minorPlayed.push('B012_Stockyard')
        player.cardStates.B012_Stockyard = { extraData: { animalCounts: { sheep: 1 } } }
      } else if (location !== 'reserve') {
        const storage = location === 'hosted' ? other : player
        const animalOwner = location === 'hosted' ? player : other
        storage.minorPlayed.push('M033_NightPasture')
        storage.cardStates.M033_NightPasture = { extraData: { animalCountsByZone: {
          [`card:M033_NightPasture:owner:${storage.id}:animalOwner:${animalOwner.id}`]: {
            animalCounts: { sheep: 1 }, ownerPlayerId: storage.id, animalOwnerPlayerId: animalOwner.id,
            cardId: 'M033_NightPasture', capacity: 1, allowedAnimalType: null,
          },
        } } }
      }
      session.loadState(state)
      const response = playMinor(session)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.minorPlayed.includes(CARD_ID))
        .toBe(location === 'reserve' || location === 'opponents-hosted')
    },
  )
  it('B034 S1: with no animals Special Food is played for free', () => {
    const response = playMinor(setup({ played: false, marketSheep: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('B034 S2: an animal already on the farm prevents playing Special Food', () => {
    const response = enterMinor(setup({ played: false, existingSheep: 1, marketSheep: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })

  it('B034 S3: accommodating both sheep taken from Sheep Market grants two bonus points and uses the card', () => {
    const response = takeSheep(setup(), 2)

    expect(response.state.players[0]!.resources.sheep).toBe(2)
    expect(response.state.players[0]!.pastures[0]).toMatchObject({
      animalType: 'sheep', animalCount: 2,
    })
    expect(bonusVp(response)).toBe(2)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
  })

  it('B034 S4: discarding any of the newly taken animals grants no points and leaves Special Food unused', () => {
    const response = takeSheep(setup({ marketSheep: 3 }), 2)

    expect(response.state.players[0]!.resources.sheep).toBe(2)
    expect(bonusVp(response)).toBe(0)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(false)
  })

  it('B034 S5: after Special Food has been used, a later complete animal collection grants no more points', () => {
    const response = takeSheep(setup({ used: true }), 2)

    expect(response.state.players[0]!.resources.sheep).toBe(2)
    expect(bonusVp(response)).toBe(0)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
  })
})
