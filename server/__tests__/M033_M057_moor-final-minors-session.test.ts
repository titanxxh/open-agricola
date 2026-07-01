import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { hasPendingExtraTurn } from '../../shared/cards/card-effects'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'
import type { SessionResponse } from '../game/authoritative-session'

const M057 = 'M057_Taps'
const M083 = 'M083_CoalSeam'
const M060 = 'M060_SowingMachine'
const M015 = 'M015_PeatBurnOff'
const M112 = 'M112_PeatAshFertilizer'
const FILLER = '__test_placeholder__'
const MOOR_A = { row: 2, col: 0, kind: 'moor' as const }
const MOOR_B = { row: 2, col: 1, kind: 'moor' as const }

const placeableSpaces = (session: GameSession) =>
  session.state.actionSpaces
    .filter((space) =>
      space.id !== '__test-worker-sink__' &&
      (!space.takenBy || space.takenBy.length === 0) &&
      (space.roundAvailable ?? 1) <= session.state.round)
    .map((space) => space.id)

const reqKind = (resp: SessionResponse): string | undefined =>
  resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : undefined

const setupM057Rotation = (minorPlayed: string[] = [M057]) => {
  const session = new GameSession(57057, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.getState().state
  state.currentPlayerIndex = 1
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.improvements = []
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources.food = 0
    player.resources.fuel = 0
    setActiveWorkerCount(player, 2)
    if (index === 0) {
      markAllWorkersUsed(state, player)
    } else {
      setWorkersAtHome(state, player, 1)
    }
  })
  state.players[0]!.minorPlayed = [...minorPlayed]
  session.loadState(state)
  return session
}

const driveToM057Offer = (session: GameSession): SessionResponse => {
  const p1Action = session.takeAction(1, placeableSpaces(session)[0]!)
  expect(p1Action.ok).toBe(true)
  return confirmNextPlayer(session)
}

const optionFor = (resp: SessionResponse, actionId: string): ActionChoiceOption => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  const option = resp.interaction.options?.find((candidate) =>
    candidate.labelKey === `moor.specialActions.${actionId}`)
  expect(option).toBeDefined()
  return option!
}

const acceptOptional = (session: GameSession, resp: SessionResponse): SessionResponse => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  const option = resp.interaction.options?.find((entry) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
}

const sowFirstField = (session: GameSession, resp: SessionResponse): SessionResponse => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(resp.interaction.promptKey).toBe('ui.interactionSowSelect')
  const field = resp.interaction.farm?.selectableFields[0]
  expect(field).toBeDefined()
  return session.commitSelectionChoice(resp.interaction.playerIndex ?? 0, {
    crops: [{ row: field!.tile.row, col: field!.tile.col, crop: 'grain' }],
  })
}

describe('M033 Night Pasture', () => {
  it('breeds the Night Pasture owner after the other players', () => {
    const session = new GameSession(33057, undefined, {
      playerCount: 3,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const state = session.getState().state
    state.round = 4
    const firstGuest = state.players[0]!
    const owner = state.players[1]!
    const secondGuest = state.players[2]!
    firstGuest.name = 'FirstGuest'
    owner.name = 'Owner'
    secondGuest.name = 'SecondGuest'
    firstGuest.startPlayer = true
    owner.startPlayer = false
    secondGuest.startPlayer = false
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 0)
      player.resources.food = 10
      player.resources.fuel = 2
      player.fields = []
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    owner.minorPlayed = ['M033_NightPasture']
    owner.cardStates = { M033_NightPasture: { extraData: {} } }
    firstGuest.resources.cattle = 2
    owner.resources.sheep = 2
    secondGuest.resources.boar = 2
    firstGuest.pastures = [{
      id: 'first-guest-pasture',
      size: 2,
      tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }],
      stables: 0,
      animalType: 'cattle',
      animalCount: 2,
    }]
    owner.pastures = [{
      id: 'owner-pasture',
      size: 2,
      tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 2,
    }]
    secondGuest.pastures = [{
      id: 'second-guest-pasture',
      size: 2,
      tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
      stables: 0,
      animalType: 'boar',
      animalCount: 2,
    }]
    session.loadState(state)

    const breedPlayers: string[] = []
    let resp: SessionResponse = session.performRoundEnd()
    for (let guard = 0; guard < 20 && resp.state.roundPhase !== 'work'; guard += 1) {
      if (resp.interaction.stateId !== 'wait') {
        resp = session.performRoundEnd()
        continue
      }
      const player = resp.state.players[resp.interaction.playerIndex]!
      if (resp.interaction.request.kind === 'heating') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { fuelUsed: 2, woodToFuel: 0 })
        continue
      }
      if (resp.interaction.request.kind === 'animal-reorg') {
        breedPlayers.push(player.name)
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.request.zones)
        continue
      }
      if (resp.interaction.request.kind === 'confirm-next-player') {
        resp = confirmNextPlayer(session)
        continue
      }
      if (resp.interaction.request.kind === 'confirm-player-switch') {
        resp = confirmPlayerSwitch(session)
        continue
      }
      throw new Error(`unexpected pending: ${resp.interaction.request.kind}`)
    }

    expect(breedPlayers).toEqual(['FirstGuest', 'SecondGuest', 'Owner'])
  })
})

describe('M057 Taps', () => {
  it('adds one no-worker extra turn that takes and executes a market special action card', () => {
    const session = setupM057Rotation()
    const player = session.state.players[0]!
    const specialCard = session.state.farmersOfTheMoor!.specialActionCards.find((card) =>
      card.actions.includes('hiring-fair'))!

    expect(workersAvailable(session.state, player)).toBe(0)
    expect(hasPendingExtraTurn(session.state, player)).toBe(true)

    const offer = driveToM057Offer(session)
    expect(session.state.currentPlayerIndex).toBe(0)
    expect(reqKind(offer)).toBe('choice')

    const chosen = session.resolveChoice(0, optionFor(offer, 'hiring-fair').value)

    expect(chosen.ok).toBe(true)
    expect(chosen.state.players[0]!.resources.food).toBe(1)
    expect(chosen.state.farmersOfTheMoor!.specialActionCards.find((card) => card.id === specialCard.id)!.location)
      .toEqual({ kind: 'playerFaceUp', playerId: player.id })
    expect(chosen.state.players[0]!.cardStates?.[M057]?.extraData?.usedThisRound).toBe(true)
    expect(hasPendingExtraTurn(chosen.state, chosen.state.players[0]!)).toBe(false)
  })

  it('fires after-special-action listeners from the Taps extra turn', () => {
    const session = setupM057Rotation([M057, M083])
    const offer = driveToM057Offer(session)

    const chosen = session.resolveChoice(0, optionFor(offer, 'hiring-fair').value)

    expect(chosen.ok).toBe(true)
    expect(chosen.state.players[0]!.resources.food).toBe(1)
    expect(chosen.state.players[0]!.resources.fuel).toBe(1)
  })

  it('fires before-special-action listeners before a Taps borrowed card action', () => {
    const session = setupM057Rotation([M057, M112])
    const player = session.state.players[0]!
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }]
    player.farmTerrain = [{ ...MOOR_A }]
    session.loadState(session.state)

    const offer = driveToM057Offer(session)
    let resp = session.resolveChoice(0, optionFor(offer, 'cut-peat').value)

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe(M112)
    resp = acceptOptional(session, resp)
    expect(resp.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(resp.state.players[0]!.resources.fuel).toBe(3)
  })

  it('disambiguates Taps card-action options by card and terrain tile', () => {
    const session = setupM057Rotation()
    const player = session.state.players[0]!
    player.farmTerrain = [{ ...MOOR_A }, { ...MOOR_B }]
    session.loadState(session.state)

    const offer = driveToM057Offer(session)
    expect(offer.interaction.stateId).toBe('wait')
    if (offer.interaction.stateId !== 'wait') throw new Error('expected wait')
    const cutPeatOptions = (offer.interaction.options ?? []).filter((option) =>
      option.labelKey === 'moor.specialActions.cut-peat')

    expect(cutPeatOptions.length).toBeGreaterThan(1)
    expect(cutPeatOptions.every((option) => option.descriptionPreview?.kind === 'group')).toBe(true)
    const labels = cutPeatOptions.map((option) => JSON.stringify(option.descriptionPreview))
    expect(new Set(labels).size).toBe(cutPeatOptions.length)
  })

  it('pays 2 food when the Taps extra turn borrows another player face-up special action card', () => {
    const session = setupM057Rotation()
    const player = session.state.players[0]!
    const other = session.state.players[1]!
    const card = session.state.farmersOfTheMoor!.specialActionCards.find((entry) =>
      entry.actions.includes('hiring-fair'))!
    card.location = { kind: 'playerFaceUp', playerId: other.id }
    player.resources.food = 2
    session.loadState(session.state)

    const offer = driveToM057Offer(session)
    const chosen = session.resolveChoice(0, optionFor(offer, 'hiring-fair').value)

    expect(chosen.ok).toBe(true)
    expect(chosen.state.players[0]!.resources.food).toBe(1)
    expect(chosen.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.id === card.id)!.location)
      .toEqual({ kind: 'playerFaceDown', playerId: player.id })
  })

  it('runs special-action follow-up before after-listener hooks from the Taps extra turn', () => {
    const session = setupM057Rotation([M057, M060])
    const player = session.state.players[0]!
    player.resources.fuel = 1
    player.resources.horse = 2
    player.resources.grain = 1
    player.fields = []
    player.farmTerrain = [{ ...MOOR_A }, { ...MOOR_B }]
    player.minorHand = [M015]
    session.state.players[1]!.minorHand = [FILLER]
    session.loadState(session.state)

    const offer = driveToM057Offer(session)
    let resp = session.resolveChoice(0, optionFor(offer, 'black-market').value)

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe(M015)
    resp = acceptOptional(session, resp)
    resp = session.commitSelectionChoice(0, { positions: [{ row: MOOR_A.row, col: MOOR_A.col }] })
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe(M060)
    resp = acceptOptional(session, resp)
    resp = sowFirstField(session, resp)

    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.cardStates?.[M057]?.extraData?.usedThisRound).toBe(true)
  })
})
