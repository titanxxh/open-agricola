import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/A/A012_DrinkingTrough'
import '../../shared/cards/D/D011_LawnFertilizer'
import assert from 'node:assert/strict'
import * as audit27Capacity from './_helpers/audit/ae-negative-27-capacity'

const CARD_ID = 'D011_LawnFertilizer'

const setup = ({
  size,
  stables = 0,
  boar,
  drinkingTrough = false,
  lawnFertilizer = true,
}: {
  size: number
  stables?: number
  boar: number
  drinkingTrough?: boolean
  lawnFertilizer?: boolean
}) => {
  const session = new GameSession(11, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed = [
    ...(lawnFertilizer ? [CARD_ID] : []),
    ...(drinkingTrough ? ['A012_DrinkingTrough'] : []),
  ]
  player.resources.boar = boar
  player.pastures = [{
    id: 'p1',
    size,
    stables,
    tiles: Array.from({ length: size }, (_, col) => ({ row: 0, col })),
    animalType: 'boar',
    animalCount: boar,
  }]
  player.stableTiles = stables > 0 ? [{ row: 0, col: 0 }] : []
  const pigMarket = state.actionSpaces.find((space) => space.id === 'pig-market')
  if (!pigMarket) throw new Error('pig market missing')
  pigMarket.resources.boar = 1
  session.loadState(state)
  return session
}

const takePigMarket = (session: GameSession) => {
  const response = session.takeAction(0, 'pig-market')
  expect(response.ok).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected animal reorganization')
  }
  return response
}

describe('D011_LawnFertilizer session', () => {
  it('D011 S1 Lawn Fertilizer lets a size-one pasture hold three animals', () => {
    const session = setup({ size: 1, boar: 2 })
    takePigMarket(session)

    const response = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 3 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(3)
  })

  it('D011 S2 Lawn Fertilizer lets a stable size-one pasture hold six animals', () => {
    const session = setup({ size: 1, stables: 1, boar: 5 })
    takePigMarket(session)

    const response = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 6 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(6)
  })

  it('D011 S3 Lawn Fertilizer leaves a size-two pasture at four and safely rejects a fifth', () => {
    const session = setup({ size: 2, boar: 4 })
    const pending = takePigMarket(session)
    const before = JSON.stringify({ state: pending.state, interaction: pending.interaction })

    let response = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 5 },
    ] as unknown as Record<string, unknown>)
    expect(response.ok).toBe(false)
    expect(response.error).toBe('log.reorganizeFail')
    expect(JSON.stringify({ state: response.state, interaction: response.interaction })).toBe(before)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
      .toBe('animal-reorg')
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(4)

    response = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 4 },
      { id: 'house:1-0', zoneType: 'house', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(4)
    expect(Object.values(response.state.players[0]!.houseAnimals).length).toBe(1)
  })

  it('D011 S4 Drinking Trough raises a Lawn Fertilizer size-one pasture to five', () => {
    const session = setup({ size: 1, boar: 4, drinkingTrough: true })
    takePigMarket(session)

    const response = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 5 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(5)
  })

  it('without D011 a size-one pasture still holds only two animals', () => {
    const session = setup({ size: 1, boar: 2, lawnFertilizer: false })
    takePigMarket(session)

    let response = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 3 },
    ] as unknown as Record<string, unknown>)
    expect(response.ok).toBe(false)
    expect(response.error).toBe('log.reorganizeFail')
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
      .toBe('animal-reorg')
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(2)

    response = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 2 },
      { id: 'house:1-0', zoneType: 'house', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(2)
    expect(Object.values(response.state.players[0]!.houseAnimals).length).toBe(1)
  })
})

describe('ae-negative-27-capacity', () => {
  const { LAWN, sessions, save, ok, finish, make, capacityCase, menu } = audit27Capacity
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D011 N1 actual reorganization allows exactly three sheep in a one cell pasture without stable and rejects fourth',()=>{capacityCase(LAWN,1,false,3,'D011-N1')})
  it('D011 N2 actual reorganization allows exactly six sheep in a stabled one cell pasture and rejects seventh',()=>{capacityCase(LAWN,1,true,6,'D011-N2')})
  it('D011 N3 two cell pastures retain ordinary four or eight capacity and reject capacity plus one',()=>{for(const stable of[false,true])capacityCase(LAWN,2,stable,stable?8:4,`D011-N3-${stable}`)})
  it('D011 N4 real free purchase and whole undo preserve pasture geometry while restoring card hand',()=>{const s=make(LAWN,1,false,false),before=ok(s.getState()),pending=menu(s),r=finish(s,ok(s.resolveChoice(0,LAWN)),false),undone=ok(s.undoAction());assert.ok(r.state.players[0]!.minorPlayed.includes(LAWN));assert.ok(undone.state.players[0]!.minorHand.includes(LAWN));assert.deepEqual(undone.state.players[0]!.pastures,before.state.players[0]!.pastures);assert.equal(undone.state.players[0]!.stableTiles.length,0);save('D011-N4',{before,pending,r,undone})})
})
