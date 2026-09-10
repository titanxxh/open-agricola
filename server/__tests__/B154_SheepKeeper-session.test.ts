import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B154_SheepKeeper'
import '../../shared/cards/A/A125_Priest'
import '../../shared/cards/A/A097_Freshman'
import '../../shared/cards/B/B012_Stockyard'
import '../../shared/cards/M/M033_NightPasture'

const CARD_ID = 'B154_SheepKeeper'
const ANYTIME_ID = 'B154-sheep-keeper-anytime'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, farmSheep = 0, reserveSheep = 0,
}: { played?: boolean; farmSheep?: number; reserveSheep?: number } = {}) => {
  const session = new GameSession(6154, undefined, { playerCount: 4 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
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
    player.pastures = []
    player.stableAnimals = {}
    player.houseAnimalType = null
    player.houseAnimalCount = 0
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID, 'A125_Priest']
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.sheep = farmSheep + reserveSheep
  owner.stableTiles = farmSheep > 0 ? [{ row: 1, col: 1 }] : []
  owner.fenceSegments = farmSheep > 0
    ? ['H-1-1', 'H-1-2', 'H-2-1', 'H-2-2', 'V-1-1', 'V-1-3'].map((edge) => ({ edge, type: 'fence' as const })) : []
  owner.pastures = farmSheep > 0 ? [{
    id: 'sheep-keeper-pasture', size: 2, tiles: [{ row: 1, col: 1 }, { row: 1, col: 2 }], stables: 1,
    animalType: 'sheep', animalCount: farmSheep,
  }] : []
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterLessons = (session: GameSession) => session.takeAction(0, 'lessons')

const playOccupation = (session: GameSession) => {
  const response = enterLessons(session)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (!card) return response
  return session.resolveChoice(response.interaction.playerIndex, card.value)
}

const enterInteraction = (session: GameSession) => {
  const response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  return response
}

const anytimeIds = (response: SessionResponse) => response.interaction.anytimeActions
  .map((action) => action.id)

describe('B154 Sheep Keeper parity', () => {
  it('enables the reward only after the seventh sheep is actually placed', () => {
    const session = setup({ farmSheep: 6 })
    session.state.round = 14
    session.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 1
    let response = session.takeAction(0, 'sheep-market')
    expect(response.interaction.request.kind).toBe('animal-reorg')
    expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
    response = session.resolveChoice(0, 'confirm', { zones: [{
      id: 'sheep-keeper-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: 7,
    }] })
    expect(response.ok, response.error).toBe(true)
    expect(anytimeIds(response)).toContain(ANYTIME_ID)
    response = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(3)
  })
  it.each(['card', 'hosted'])('counts the seventh sheep in %s storage for both gates', (location) => {
    for (const played of [false, true]) {
      const session = setup({ played, farmSheep: 6, reserveSheep: 1 })
      const state = session.getState().state
      const player = state.players[0]!
      if (location === 'card') {
        player.minorPlayed.push('B012_Stockyard')
        player.cardStates.B012_Stockyard = { extraData: { animalCounts: { sheep: 1 } } }
      } else {
        const storage = state.players[1]!
        storage.minorPlayed.push('M033_NightPasture')
        storage.cardStates.M033_NightPasture = { extraData: { animalCountsByZone: {
          [`card:M033_NightPasture:owner:${storage.id}:animalOwner:${player.id}`]: {
            animalCounts: { sheep: 1 }, ownerPlayerId: storage.id, animalOwnerPlayerId: player.id,
            cardId: 'M033_NightPasture', capacity: 1, allowedAnimalType: null,
          },
        } } }
      }
      session.loadState(state)
      if (played) {
        expect(anytimeIds(enterInteraction(session))).toContain(ANYTIME_ID)
        const response = session.takeAnytimeAction(0, ANYTIME_ID)
        expect(response.ok, response.error).toBe(true)
        expect(response.state.players[0]!.resources.food).toBe(2)
        expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(3)
      } else {
        expect(options(enterLessons(session)).map((option) => option.value)).not.toContain(CARD_ID)
        expect(session.resolveChoice(0, CARD_ID).ok).toBe(false)
      }
    }
  })
  it('B154 S1: with fewer than seven farm sheep Sheep Keeper is played as the first occupation', () => {
    const response = playOccupation(setup({ played: false, farmSheep: 6 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players).toHaveLength(4)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('seven placed sheep prevent offering or submitting Sheep Keeper', () => {
    const session = setup({ played: false, farmSheep: 7 })
    const offered = enterLessons(session)
    expect(options(offered).map((option) => option.value)).not.toContain(CARD_ID)
    const response = session.resolveChoice(0, CARD_ID)
    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.occupationPlayed).not.toContain(CARD_ID)
  })

  it('B154 S3: six farm sheep plus one unplaced reserve sheep still allow Sheep Keeper to be played', () => {
    const response = playOccupation(setup({
      played: false, farmSheep: 6, reserveSheep: 1,
    }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B154 S4: one unplaced reserve sheep does not enable the reward at six farm sheep', () => {
    const response = enterInteraction(setup({ farmSheep: 6, reserveSheep: 1 }))

    expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('B154 S5: seven sheep on the farm grant three bonus points and two food once', () => {
    const session = setup({ farmSheep: 7 })
    const entered = enterInteraction(session)
    expect(anytimeIds(entered)).toContain(ANYTIME_ID)

    const response = session.takeAnytimeAction(0, ANYTIME_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(3)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
  })

  it('B154 S6: a used Sheep Keeper cannot grant its reward again', () => {
    const session = setup({ farmSheep: 7 })
    enterInteraction(session)

    const response = session.takeAnytimeAction(0, ANYTIME_ID)

    expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(3)
  })
  it.each([[6, 0, true], [7, 0, false], [6, 1, true]] as const)(
    'Freshman respects placed sheep %i plus reserve %i (allowed %s)',
    (farmSheep, reserveSheep, allowed) => {
      const session = setup({ played: false, farmSheep, reserveSheep })
      const state = session.getState().state
      state.round = 14
      state.players[0]!.occupationPlayed = ['A097_Freshman']
      state.players[0]!.occupationHand = [CARD_ID]
      session.loadState(state)
      const offered = session.takeAction(0, 'grain-utilization')
      const replacement = options(offered).find((option) => option.sourceCard === 'A097_Freshman')
      expect(Boolean(replacement), JSON.stringify(offered.interaction)).toBe(allowed)
      if (!replacement) {
        expect(offered.state.players[0]!.occupationHand).toContain(CARD_ID)
        expect(offered.state.players[0]!.cardStates.A097_Freshman?.flagged).not.toBe(true)
        return
      }
      const response = session.resolveChoice(0, replacement.value)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources.food).toBe(0)
    },
  )

})
