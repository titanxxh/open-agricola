import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { collectTriggerCardsAs } from '../../shared/cards/helpers/trigger-snapshot'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { setWorkersAtHome } from '../../shared/domain/player'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { CustomCardData } from '../../shared/cards/session-card-context'
import { payLeaf } from '../../shared/cards/helpers/pay-gain-node'
import type { GameState } from '../../shared/contract/types'

const ALMANAC = 'E018_SeedAlmanac'
const MACHINE = 'M060_SowingMachine'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function opening(configure?: (state: GameState) => void, customCards?: CustomCardData[]) {
  const session = createWorkSession({ seed: 1293, customCards, options: {
    playerCount: 2, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
  }, configure: state => {
    state.round = 8
    state.currentPlayerIndex = 0
    for (const space of state.actionSpaces) space.takenBy = []
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      for (const key of Object.keys(player.resources)) Reflect.set(player.resources, key, 0)
      player.rooms = 2
      player.roomTiles = [{ row: 2, col: 3 }, { row: 2, col: 4 }]
      player.farmTerrain = [{ row: 0, col: 0, kind: 'forest' }, { row: 2, col: 0, kind: 'moor' }]
      player.fields = [{ row: 0, col: 1, stacks: [] }]
      player.pastures = []
      player.stableTiles = []
      player.houseAnimals = {}
      setWorkersAtHome(state, player, 2)
    }
    const player = state.players[0]!
    player.minorPlayed = [ALMANAC, MACHINE]
    player.occupationPlayed = ['A085_Academic', 'A086_Braggart', 'A087_CarriageDriver', 'A088_FenceDealer']
    player.minorHand = ['A032_Manger']
    Object.assign(player.resources, { horse: 2, grain: 2, food: 1, fuel: 1, wood: 2 })
    player.pastures = [{ id: 'horses', size: 2, tiles: [{ row: 1, col: 3 }, { row: 1, col: 4 }],
      stables: 0, animalType: 'horse', animalCount: 2 }]
    configure?.(state)
  } })
  sessions.push(session)
  expect(session.getState().interaction.stateId).toBe('idle')
  return session
}
const options = (r: SessionResponse) => r.interaction.stateId === 'wait' ? r.interaction.request.options ?? [] : []
function choose(session: GameSession, r: SessionResponse, value: string) {
  expect(options(r).some(option => option.value === value && !option.disabled), JSON.stringify(r.interaction)).toBe(true)
  const next = session.resolveChoice(0, value)
  expect(next.ok, next.error).toBe(true)
  return next
}
function accept(session: GameSession, r: SessionResponse, card: string) {
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') {
    const trigger = options(r).find(option => option.sourceCard === card)
    expect(trigger, JSON.stringify(r.interaction)).toBeDefined()
    r = choose(session, r, trigger!.value)
  }
  expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard, JSON.stringify(r.interaction)).toBe(card)
  const option = options(r).find(option => option.value !== '__skip__' && !option.disabled)
  expect(option).toBeDefined()
  return choose(session, r, option!.value)
}
function blackMarket(session: GameSession) {
  let r = session.takeSpecialAction(0, 'moor-special-1-2-market-work', 'black-market')
  expect(r.ok, r.error).toBe(true)
  if (!r.state.players[0]!.minorPlayed.includes('A032_Manger')) r = choose(session, r, 'A032_Manger')
  expect(r.state.players[0]!.minorPlayed).toContain('A032_Manger')
  expect(r.state.players[0]!.resources).toMatchObject({ fuel: 0, wood: 0 })
  return r
}
function farm(session: GameSession, r: SessionResponse, payload: Record<string, unknown>) {
  expect(r.interaction.stateId === 'wait' && r.interaction.request.kind).toBe('farm-select')
  const next = session.commitSelectionChoice(0, payload)
  expect(next.ok, next.error).toBe(true)
  return next
}

function restore(session: GameSession) {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
  sessions.push(restored)
  expect(restored.getState().interaction).toEqual(session.getState().interaction)
  expect(restored.getState().scores).toEqual(session.getState().scores)
  return restored
}
function reject(session: GameSession, command: () => SessionResponse) {
  const snapshot = JSON.stringify(serializeSessionSnapshot(session.state, session))
  const before = session.getState()
  const response = command()
  expect(response.ok).toBe(false)
  expect(JSON.stringify(serializeSessionSnapshot(session.state, session))).toBe(snapshot)
  expect(session.getState().interaction).toEqual(before.interaction)
  expect(session.getState().scores).toEqual(before.scores)
}

describe('Moor primary body completion', () => {
  it.each([true, false])('shares the terminal improvement and Moor after window, Almanac first=%s', almanacFirst => {
    const session = opening()
    let r = blackMarket(session)
    expect(r.interaction.stateId === 'wait' && r.interaction.request.kind, JSON.stringify(r.interaction)).toBe('select-trigger')
    expect(options(r).filter(option => option.sourceCard).map(option => option.sourceCard).sort()).toEqual([ALMANAC, MACHINE].sort())
    if (almanacFirst) {
      r = accept(session, r, ALMANAC)
      r = farm(session, r, { tile: { row: 0, col: 2 } })
      r = accept(session, r, MACHINE)
      r = farm(session, r, { crops: [{ row: 0, col: 1, crop: 'grain' }, { row: 0, col: 2, crop: 'grain' }] })
    } else {
      r = accept(session, r, MACHINE)
      r = farm(session, r, { crops: [{ row: 0, col: 1, crop: 'grain' }] })
      r = accept(session, r, ALMANAC)
      r = farm(session, r, { tile: { row: 0, col: 2 } })
    }
    const p = r.state.players[0]!
    expect(p.fields).toEqual([
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 2, stacks: almanacFirst ? [{ kind: 'grain', remaining: 3 }] : [] },
    ])
    expect(p.resources).toMatchObject({ grain: almanacFirst ? 0 : 1, food: 0, wood: 0, fuel: 0 })
    expect(r.scores[0]!.categories.find(category => category.key === 'fields')).toMatchObject({ quantity: 2, total: 1 })
    expect(r.scores[0]!.categories.find(category => category.key === 'grains')).toMatchObject({ quantity: 2, total: 1 })
    expect(r.state.events.filter(event => (event.type === 'farm.fieldPlowed' || event.type === 'farm.sown') && [ALMANAC, MACHINE].includes(event.sourceCardId ?? '')).map(event => event.sourceCardId))
      .toEqual(almanacFirst ? [ALMANAC, MACHINE] : [MACHINE, ALMANAC])
    const ordered = r.state.events.filter(event => (event.type === 'farm.fieldPlowed' || event.type === 'farm.sown')
      && [ALMANAC, MACHINE].includes(event.sourceCardId ?? ''))
    expect(r.state.log.toReversed().flatMap(entry => {
      const event = ordered.find(event => event.occurrenceId === entry.sourceEvent?.occurrenceId)
      return event ? [event.sourceCardId] : []
    })).toEqual(almanacFirst ? [ALMANAC, MACHINE] : [MACHINE, ALMANAC])
  })
  it('finishes the intermediate sow reaction before the onBuy stone payment', () => {
    const card = 'CUSTOM_MoorSowThenPay'
    const session = opening(state => {
      state.players[0]!.minorPlayed = ['E079_FieldSpade', MACHINE]
      state.players[0]!.resources.stone = 0
      state.players[0]!.minorHand = [card]
    }, [{ cardType: 'minor', cardJson: { id: card, name: 'Sow then pay', deck: 'CUSTOM', number: 0, desc: [], cost: {} } }])
    session.withCtx(() => requireActiveCardRegistry('moor-intermediate-test').setEffect({
      id: card, onBuy: () => ({ type: 'seq', children: [
        { type: 'leaf', actionId: 'sow', sourceCard: card },
        payLeaf({ cardId: card, cost: { stone: 1 } }),
      ] }),
    }))
    let r = session.takeSpecialAction(0, 'moor-special-1-2-market-work', 'black-market')
    expect(r.ok, r.error).toBe(true)
    expect(r.interaction.stateId === 'wait' && r.interaction.promptKey).toBe('ui.interactionSowSelect')
    expect(r.state.players[0]!.minorPlayed).toContain(card)
    expect(r.state.players[0]!.resources).toMatchObject({ stone: 0, fuel: 0, wood: 2 })
    r = farm(session, r, { crops: [{ row: 0, col: 1, crop: 'grain' }] })
    expect(r.ok, r.error).toBe(true)
    expect(r.state.players[0]!.resources).toMatchObject({ stone: 0, grain: 1 })
    const gained = r.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === 'E079_FieldSpade')
    const paid = r.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === card && event.resources.stone === 1)
    expect(gained).toHaveLength(1)
    expect(paid).toHaveLength(1)
    expect(gained[0]!.seq).toBeLessThan(paid[0]!.seq)
    expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard).not.toBe('E079_FieldSpade')
    expect(r.state.log.length).toBeGreaterThan(0)
  })

  it.each([['M058_PeatFertilizer', MACHINE], [MACHINE, 'M058_PeatFertilizer']])(
    'recomputes the remaining Moor source after %s sows one field', (first, second) => {
      const session = opening(state => {
        state.players[0]!.minorPlayed = ['M058_PeatFertilizer', MACHINE]
        state.players[0]!.fields.push({ row: 0, col: 2, stacks: [] })
        state.players[0]!.resources.fuel = 0
      })
      let r = session.takeSpecialAction(0, 'moor-special-1-2-terrain', 'cut-peat', { tile: { row: 2, col: 0 } })
      expect(r.interaction.stateId === 'wait' && r.interaction.request.kind).toBe('select-trigger')
      r = accept(session, r, first)
      r = farm(session, r, { crops: [{ row: 0, col: 1, crop: 'grain' }] })
      r = accept(session, r, second)
      expect(r.interaction.stateId === 'wait' && r.interaction.request.farm?.selectableFields.map(field => field.tile)).toEqual([{ row: 0, col: 2 }])
      r = farm(session, r, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
      expect(r.state.players[0]!.resources).toMatchObject({ grain: 0, fuel: 3 })
      expect(r.state.events.filter(event => event.type === 'farm.sown').map(event => event.sourceCardId)).toEqual([first, second])
      expect(r.state.players[0]!.fields.map(field => field.stacks)).toEqual([
        [{ kind: 'grain', remaining: 3 }], [{ kind: 'grain', remaining: 3 }],
      ])
    })

  it.each(['M058_PeatFertilizer', MACHINE])('can decline %s and pass the other Moor source', first => {
    const session = opening(state => {
      state.players[0]!.minorPlayed = ['M058_PeatFertilizer', MACHINE]
      state.players[0]!.fields.push({ row: 0, col: 2, stacks: [] })
    })
    let r = session.takeSpecialAction(0, 'moor-special-1-2-terrain', 'cut-peat', { tile: { row: 2, col: 0 } })
    r = choose(session, r, options(r).find(option => option.sourceCard === first)!.value)
    r = choose(session, r, '__skip__')
    r = choose(session, r, '__pass__')
    expect(r.state.players[0]!.resources.grain).toBe(2)
    expect(r.state.players[0]!.fields.every(field => field.stacks.length === 0)).toBe(true)
    expect(r.state.events.filter(event => event.type === 'farm.sown')).toHaveLength(0)
  })

  it('does not run the remaining Moor source after all fields and grain are used', () => {
    const session = opening(state => {
      state.players[0]!.minorPlayed = ['M058_PeatFertilizer', MACHINE]
      state.players[0]!.fields.push({ row: 0, col: 2, stacks: [] })
    })
    let r = session.takeSpecialAction(0, 'moor-special-1-2-terrain', 'cut-peat', { tile: { row: 2, col: 0 } })
    r = accept(session, r, MACHINE)
    r = farm(session, r, { crops: [{ row: 0, col: 1, crop: 'grain' }, { row: 0, col: 2, crop: 'grain' }] })
    expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard).not.toBe('M058_PeatFertilizer')
    expect(r.state.players[0]!.resources.grain).toBe(0)
    expect(r.state.events.filter(event => event.type === 'farm.sown')).toHaveLength(1)
  })

  it.each(['improvement', 'mixed', 'plow', 'after-first', 'sow'])('restores the frozen completion at %s and rejects repeated invalid input', stage => {
    let session = opening(state => { state.players[0]!.minorHand.push('E050_WildGreens') })
    let r = session.takeSpecialAction(0, 'moor-special-1-2-market-work', 'black-market')
    expect(r.state.players[0]!.resources.fuel).toBe(0)
    expect(r.state.players[0]!.resources.wood).toBe(2)
    if (stage === 'improvement') {
      session = restore(session)
      reject(session, () => session.resolveChoice(1, 'A032_Manger'))
      reject(session, () => session.resolveChoice(0, 'stale'))
      reject(session, () => session.resolveChoice(0, 'stale'))
      r = session.getState()
    }
    r = choose(session, r, 'A032_Manger')
    expect(r.interaction.stateId === 'wait' && r.interaction.request.kind).toBe('select-trigger')
    if (stage === 'mixed') {
      session = restore(session)
      const value = options(session.getState()).find(option => option.sourceCard === ALMANAC)!.value
      reject(session, () => session.resolveChoice(1, value))
      reject(session, () => session.resolveChoice(0, 'stale'))
      reject(session, () => session.resolveChoice(0, 'stale'))
      r = session.getState()
    }
    r = accept(session, r, ALMANAC)
    if (stage === 'plow') {
      session = restore(session)
      reject(session, () => session.commitSelectionChoice(1, { tile: { row: 0, col: 2 } }))
      reject(session, () => session.commitSelectionChoice(0, { tile: { row: 2, col: 3 } }))
      reject(session, () => session.commitSelectionChoice(0, { tile: { row: 2, col: 3 } }))
      r = session.getState()
    }
    r = farm(session, r, { tile: { row: 0, col: 2 } })
    if (stage === 'after-first') { session = restore(session); r = session.getState() }
    r = accept(session, r, MACHINE)
    if (stage === 'sow') {
      session = restore(session)
      reject(session, () => session.commitSelectionChoice(1, { crops: [{ row: 0, col: 1, crop: 'grain' }] }))
      reject(session, () => session.commitSelectionChoice(0, { crops: [{ row: 2, col: 3, crop: 'grain' }] }))
      reject(session, () => session.commitSelectionChoice(0, { crops: [{ row: 2, col: 3, crop: 'grain' }] }))
      r = session.getState()
    }
    r = farm(session, r, { crops: [{ row: 0, col: 1, crop: 'grain' }, { row: 0, col: 2, crop: 'grain' }] })
    expect(r.state.players[0]!.resources).toMatchObject({ fuel: 0, wood: 0, food: 0, grain: 0 })
    expect(r.state.events.filter(event => event.type === 'card.played' && event.cardId === 'A032_Manger')).toHaveLength(1)
    expect(r.state.events.filter(event => event.type === 'farm.fieldPlowed' && event.sourceCardId === ALMANAC)).toHaveLength(1)
    expect(r.state.events.filter(event => event.type === 'farm.sown' && event.sourceCardId === MACHINE)).toHaveLength(1)
    expect(r.scores[0]!.categories.find(category => category.key === 'grains')).toMatchObject({ quantity: 2, total: 1 })
  })

  it.each(['discard', 'keep', 'cook'])('waits for Horse Market animal handling, final choice=%s', mode => {
    let session = opening(state => {
      const p = state.players[0]!
      p.minorPlayed = mode === 'cook' ? [MACHINE, 'M107_PotRoastRecipe'] : [MACHINE]
      p.resources.horse = 1
      p.resources.grain = 1
      p.pastures[0]!.animalCount = 1
      if (mode === 'discard') {
        p.pastures = []
        p.houseAnimals = { '2-3': 'horse' }
      }
      if (mode === 'cook') p.improvements = ['Major_Fireplace1']
    })
    let r = session.takeSpecialAction(0, 'moor-special-1-2-market-work', 'horse-market')
    expect(r.interaction.stateId === 'wait' && r.interaction.request.kind).toBe('animal-reorg')
    expect(r.state.events.filter(event => event.type === 'farm.sown')).toHaveLength(0)
    expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard).not.toBe(MACHINE)
    session = restore(session)
    reject(session, () => session.resolveChoice(1, 'confirm', { zones: [] }))
    reject(session, () => session.resolveChoice(0, 'confirm', { zones: [{ id: 'horses', zoneType: 'pasture', animalType: 'horse', animalCount: 100 }] }))
    if (mode === 'cook') {
      r = session.takeAnytimeAction(0, 'exchange')
      const recipe = options(r).find(option => option.effectPreview?.kind === 'resourceExchange' && (option.effectPreview.resourcesPaid?.horse ?? 0) > 0)
      expect(recipe, JSON.stringify(r.interaction)).toBeDefined()
      r = session.resolveChoice(0, `bulk:${recipe!.value.split(':')[1]}=1`)
      expect(r.ok, r.error).toBe(true)
      expect(r.state.players[0]!.resources).toMatchObject({ horse: 1, food: 2 })
    }
    r = session.resolveChoice(0, 'confirm', { zones: mode === 'discard'
      ? [{ id: 'house:2-3', zoneType: 'house', animalType: 'horse', animalCount: 1 }]
      : [{ id: 'horses', zoneType: 'pasture', animalType: 'horse', animalCount: mode === 'keep' ? 2 : 1 }] })
    expect(r.ok, r.error).toBe(true)
    if (mode === 'keep') {
      r = accept(session, r, MACHINE)
      r = farm(session, r, { crops: [{ row: 0, col: 1, crop: 'grain' }] })
      expect(r.state.players[0]!.resources).toMatchObject({ horse: 2, grain: 0, food: 0 })
      expect(r.state.events.filter(event => event.type === 'farm.sown')).toHaveLength(1)
    } else {
      expect(r.state.players[0]!.resources).toMatchObject({ horse: 1, grain: 1, food: mode === 'cook' ? 2 : 0 })
      expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard).not.toBe(MACHINE)
      expect(r.state.events.filter(event => event.type === 'farm.sown')).toHaveLength(0)
    }
  })

  it('restores onBuy terrain conversion before the existing Moor source sows the new field', () => {
    let session = opening(state => {
      const p = state.players[0]!
      p.minorPlayed = [MACHINE]
      p.minorHand = ['M015_PeatBurnOff']
      p.fields = []
      p.resources.grain = 1
    })
    let r = session.takeSpecialAction(0, 'moor-special-1-2-market-work', 'black-market')
    expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard).toBe('M015_PeatBurnOff')
    session = restore(session)
    r = accept(session, session.getState(), 'M015_PeatBurnOff')
    expect(r.ok, r.error).toBe(true)
    session = restore(session)
    reject(session, () => session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] }))
    r = session.commitSelectionChoice(0, { positions: [{ row: 2, col: 0 }] })
    expect(r.ok, r.error).toBe(true)
    r = accept(session, r, MACHINE)
    r = farm(session, r, { crops: [{ row: 2, col: 0, crop: 'grain' }] })
    expect(r.state.players[0]!.resources.grain).toBe(0)
    expect(r.state.players[0]!.fields).toEqual([{ row: 2, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] }])
    expect(r.state.events.filter(event => event.type === 'card.passed' && event.cardId === 'M015_PeatBurnOff')).toHaveLength(1)
    expect(r.state.events.filter(event => event.type === 'farm.terrainChanged' && event.sourceCardId === 'M015_PeatBurnOff')).toHaveLength(1)
  })

  it('excludes a newly purchased Moor source until the next actual special action', () => {
    const session = opening(state => {
      const p = state.players[0]!
      p.minorPlayed = []
      p.minorHand = [MACHINE]
      p.resources.wood = 3
      p.resources.grain = 1
    })
    let r = session.takeSpecialAction(0, 'moor-special-1-2-market-work', 'black-market')
    expect(r.state.players[0]!.minorPlayed).toContain(MACHINE)
    expect(r.state.players[0]!.resources).toMatchObject({ wood: 0, fuel: 0, grain: 1 })
    expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard).not.toBe(MACHINE)
    expect(r.interaction.stateId === 'wait' && r.interaction.request.kind).toBe('confirm-next-player')
    expect(session.resolveChoice(1, 'confirm').ok).toBe(true)
    r = session.takeAction(1, 'forest')
    expect(r.ok, r.error).toBe(true)
    expect(session.resolveChoice(0, 'confirm').ok).toBe(true)
    r = session.takeSpecialAction(0, 'moor-special-1-2-terrain', 'cut-peat', { tile: { row: 2, col: 0 } })
    expect(r.ok, r.error).toBe(true)
    r = accept(session, r, MACHINE)
    r = farm(session, r, { crops: [{ row: 0, col: 1, crop: 'grain' }] })
    expect(r.state.players[0]!.resources).toMatchObject({ fuel: 3, grain: 0 })
  })

  it('undoes a selected farm step and then the whole special action before exact retry', () => {
    const session = opening()
    let r = blackMarket(session)
    r = accept(session, r, ALMANAC)
    r = farm(session, r, { tile: { row: 0, col: 2 } })
    expect(r.state.players[0]!.fields).toHaveLength(2)
    r = session.undoStep(0)
    expect(r.ok, r.error).toBe(true)
    expect(r.interaction.stateId === 'wait' && r.interaction.promptKey).toBe('ui.interactionPlowSelect')
    expect(r.state.players[0]!.resources.food).toBe(0)
    expect(r.state.players[0]!.fields).toEqual([{ row: 0, col: 1, stacks: [] }])
    r = farm(session, r, { tile: { row: 0, col: 2 } })
    r = accept(session, r, MACHINE)
    r = farm(session, r, { crops: [{ row: 0, col: 1, crop: 'grain' }, { row: 0, col: 2, crop: 'grain' }] })
    expect(r.state.players[0]!.resources.grain).toBe(0)
    r = session.undoAction(0)
    expect(r.ok, r.error).toBe(true)
    expect(r.state.players[0]!.resources).toMatchObject({ grain: 2, food: 1, wood: 2, fuel: 1 })
    expect(r.state.players[0]!.minorHand).toEqual(['A032_Manger'])
    expect(r.state.players[0]!.fields).toEqual([{ row: 0, col: 1, stacks: [] }])
    r = blackMarket(session)
    r = accept(session, r, MACHINE)
    r = farm(session, r, { crops: [{ row: 0, col: 1, crop: 'grain' }] })
    r = accept(session, r, ALMANAC)
    r = farm(session, r, { tile: { row: 0, col: 2 } })
    expect(r.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0, wood: 0, fuel: 0 })
    expect(r.state.events.filter(event => event.type === 'card.played' && event.cardId === 'A032_Manger')).toHaveLength(1)
    expect(r.state.events.filter(event => event.type === 'farm.fieldPlowed' && event.sourceCardId === ALMANAC)).toHaveLength(1)
    expect(r.state.events.filter(event => event.type === 'farm.sown' && event.sourceCardId === MACHINE)).toHaveLength(1)
  })

  it('finishes terminal immediate reactions before opening the shared ordinary after window', () => {
    const immediate = 'TEST_MoorTerminalImmediate'
    const session = opening(state => {
      state.players[0]!.minorPlayed.push(immediate)
      state.players[0]!.resources.food = 0
    })
    session.withCtx(() => requireActiveCardRegistry('moor-immediate-test').registerListener({
      id: immediate, cardIds: [immediate], actions: ['improvement'], phases: ['immediatelyAfter'],
      handler: () => ({ sourceCard: immediate, flow: { type: 'leaf', actionId: 'gain', sourceCard: immediate, params: { food: 1 }, optional: true } }),
    }))
    let r = blackMarket(session)
    expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard).toBe(immediate)
    expect(r.state.players[0]!.resources.food).toBe(0)
    r = accept(session, r, immediate)
    expect(r.state.players[0]!.resources.food).toBe(1)
    expect(r.interaction.stateId === 'wait' && r.interaction.request.kind).toBe('select-trigger')
    expect(options(r).filter(option => option.sourceCard).map(option => option.sourceCard).sort()).toEqual([ALMANAC, MACHINE].sort())
    r = accept(session, r, ALMANAC)
    r = farm(session, r, { tile: { row: 0, col: 2 } })
    r = accept(session, r, MACHINE)
    r = farm(session, r, { crops: [{ row: 0, col: 1, crop: 'grain' }, { row: 0, col: 2, crop: 'grain' }] })
    const events = r.state.events
    const gain = events.find(event => event.type === 'resource.moved' && event.sourceCardId === immediate)
    const pay = events.find(event => event.type === 'resource.paid' && event.sourceCardId === ALMANAC)
    expect(gain).toBeDefined()
    expect(pay).toBeDefined()
    expect(gain!.seq).toBeLessThan(pay!.seq)
  })

  it('groups terminal rule and Moor sources by their captured owner', () => {
    const rule = 'TEST_OtherOwnerRuleAfter', moor = 'TEST_OtherOwnerMoorAfter'
    const session = opening(state => {
      state.players[0]!.minorPlayed = [MACHINE]
      state.players[1]!.minorPlayed = [rule, moor]
    })
    session.withCtx(() => {
      const registry = requireActiveCardRegistry('moor-owner-test')
      registry.registerListener({ id: rule, cardIds: [rule], actions: ['improvement'], phases: ['after'], scope: 'opponent',
        handler: context => context.ownerPlayer?.id === 'p2' && context.triggerPlayer?.id === 'p1'
          ? { sourceCard: rule, flow: { type: 'leaf', actionId: 'gain', sourceCard: rule, params: { stone: 1 } } } : undefined })
      registry.registerListener({ id: moor, cardIds: [moor], actions: ['black-market'], phases: ['after'], scope: 'opponent',
        handler: context => context.ownerPlayer?.id === 'p2' && context.triggerPlayer?.id === 'p1'
          ? { sourceCard: moor, flow: { type: 'leaf', actionId: 'gain', sourceCard: moor, params: { reed: 1 } } } : undefined })
    })
    let r = blackMarket(session)
    r = choose(session, r, '__skip__')
    expect(r.interaction.stateId === 'wait' && r.interaction.request.kind).toBe('confirm-player-switch')
    r = session.resolveChoice(0, 'confirm')
    expect(r.ok, r.error).toBe(true)
    expect(r.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'select-trigger' } })
    expect(options(r).filter(option => option.sourceCard).map(option => option.sourceCard).sort()).toEqual([rule, moor].sort())
    reject(session, () => session.resolveChoice(0, options(r).find(option => option.sourceCard === moor)!.value))
    r = session.resolveChoice(1, options(r).find(option => option.sourceCard === moor)!.value)
    expect(r.ok, r.error).toBe(true)
    expect(r.state.players[1]!.resources).toMatchObject({ reed: 1, stone: 0 })
    r = session.resolveChoice(1, options(r).find(option => option.sourceCard === rule)!.value)
    expect(r.ok, r.error).toBe(true)
    expect(r.state.players[1]!.resources).toMatchObject({ reed: 1, stone: 1 })
    expect(r.state.players[0]!.resources).toMatchObject({ reed: 0, stone: 0 })
    expect(r.state.events.filter(event => event.type === 'resource.moved' && [rule, moor].includes(event.sourceCardId ?? '')).map(event => event.sourceCardId)).toEqual([moor, rule])
  })

  it('keeps Pass disabled while a captured mandatory Moor source can execute', () => {
    const mandatory = 'TEST_MandatoryMoorAfter'
    const session = opening(state => { state.players[0]!.minorPlayed = [MACHINE, mandatory] })
    session.withCtx(() => requireActiveCardRegistry('moor-mandatory-test').registerListener({
      id: mandatory, cardIds: [mandatory], actions: ['cut-peat'], phases: ['after'], mandatory: true,
      handler: () => ({ sourceCard: mandatory, flow: { type: 'leaf', actionId: 'gain', sourceCard: mandatory, params: { stone: 1 } } }),
    }))
    let r = session.takeSpecialAction(0, 'moor-special-1-2-terrain', 'cut-peat', { tile: { row: 2, col: 0 } })
    expect(options(r).find(option => option.value === '__pass__')?.disabled).toBe(true)
    reject(session, () => session.resolveChoice(0, '__pass__'))
    r = choose(session, r, options(r).find(option => option.sourceCard === mandatory)!.value)
    expect(r.state.players[0]!.resources.stone).toBe(1)
    r = choose(session, r, '__pass__')
    expect(r.state.players[0]!.resources.grain).toBe(2)
    expect(r.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === mandatory)).toHaveLength(1)
  })

  it('keeps each domain source snapshot and receipt when they share the final window', () => {
    const rule = 'TEST_ImprovementReceipt', moor = 'TEST_MoorReceipt'
    const session = opening(state => { state.players[0]!.minorPlayed = [rule, moor] })
    session.withCtx(() => {
      const registry = requireActiveCardRegistry('moor-receipt-test')
      registry.registerListener({ id: rule, cardIds: [rule], actions: ['improvement'], phases: ['after'],
        handler: context => context.choice === 'A032_Manger'
          && collectTriggerCardsAs(context, context.player, 'minor').includes('A032_Manger')
          && context.actionEvents?.some(event => event.type === 'card.played' && event.cardId === 'A032_Manger')
          ? { sourceCard: rule, flow: { type: 'leaf', actionId: 'gain', sourceCard: rule, params: { clay: 1 } } } : undefined })
      registry.registerListener({ id: moor, cardIds: [moor], actions: ['black-market'], phases: ['after'],
        handler: context => !collectTriggerCardsAs(context, context.player, 'minor').includes('A032_Manger')
          && context.actionEvents?.length === 0 && context.result?.type === 'ok'
          ? { sourceCard: moor, flow: { type: 'leaf', actionId: 'gain', sourceCard: moor, params: { stone: 1 } } } : undefined })
    })
    let r = blackMarket(session)
    expect(r.interaction.stateId === 'wait' && r.interaction.request.kind).toBe('select-trigger')
    expect(options(r).filter(option => option.sourceCard).map(option => option.sourceCard).sort()).toEqual([rule, moor].sort())
    r = choose(session, r, options(r).find(option => option.sourceCard === moor)!.value)
    r = choose(session, r, options(r).find(option => option.sourceCard === rule)!.value)
    expect(r.state.players[0]!.resources).toMatchObject({ clay: 1, stone: 1, wood: 0, fuel: 0 })
    expect(r.state.events.filter(event => event.type === 'resource.moved' && [rule, moor].includes(event.sourceCardId ?? '')).map(event => event.sourceCardId)).toEqual([moor, rule])
  })

  it('keeps the Moor after window dormant when required onBuy work is blocked', () => {
    const card = 'CUSTOM_MoorRequiredPayment'
    const session = opening(state => {
      state.players[0]!.minorPlayed = [MACHINE]
      state.players[0]!.minorHand = [card]
    }, [{ cardType: 'minor', cardJson: { id: card, name: 'Required payment', deck: 'CUSTOM', number: 0, desc: [], cost: {} } }])
    session.withCtx(() => requireActiveCardRegistry('moor-required-test').setEffect({
      id: card, onBuy: () => payLeaf({ cardId: card, cost: { stone: 1 } }),
    }))
    let r = session.takeSpecialAction(0, 'moor-special-1-2-market-work', 'black-market')
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'ui.interactionBeforeAnytime') r = choose(session, r, 'continue')
    expect(r.interaction, JSON.stringify(r.interaction)).toMatchObject({ stateId: 'wait', request: { kind: 'engine-blocked', actionId: 'pay' } })
    expect(r.state.players[0]!.resources).toMatchObject({ stone: 0, grain: 2, fuel: 0 })
    expect(r.state.events.filter(event => event.type === 'farm.sown')).toHaveLength(0)
    expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard).not.toBe(MACHINE)
    const undone = session.undoAction(0)
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.minorHand).toEqual([card])
    expect(undone.state.players[0]!.resources.fuel).toBe(1)
  })

})
