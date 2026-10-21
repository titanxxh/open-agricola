import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { GameState, Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { getChoiceOptions } from './_helpers/session-assertions'
import { familySize } from '../../shared/domain/player'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function make(card: string, resources: Partial<Resource>, configure?: (state: GameState) => void) {
  const session = createWorkSession({ seed: 42, options: { playerCount: card === 'A149_HouseArtist' ? 4 : 2 }, configure: state => {
    state.round = 14
    for (const player of state.players) {
      for (const resource of Object.keys(player.resources)) Reflect.set(player.resources, resource, 0)
    }
    const player = state.players[0]!
    if (card === 'C026_Flail') player.minorPlayed = [card]
    else player.occupationPlayed = [card]
    Object.assign(player.resources, resources)
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 1
    const traveling = state.actionSpaces.find(space => space.id === 'traveling-players')
    if (traveling) traveling.resources.food = 2
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

function choose(session: GameSession, response: SessionResponse, predicate: (option: ReturnType<typeof getChoiceOptions>[number]) => boolean) {
  const option = getChoiceOptions(response).find(option => !option.disabled && predicate(option))
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  if (response.interaction.stateId !== 'wait') throw new Error('Expected choice')
  const next = session.resolveChoice(response.interaction.playerIndex, option!.value)
  expect(next.ok, next.error).toBe(true)
  return next
}

function accept(session: GameSession, response: SessionResponse) {
  return choose(session, response, option => !['__skip__', '__done__', '__pass__'].includes(option.value))
}

function beforeHost(response: SessionResponse) {
  expect(response.ok, response.error).toBe(true)
  expect(response.state.events.filter(event => event.type === 'resource.moved' && !event.sourceCardId)).toHaveLength(0)
  expect(response.interaction.stateId).toBe('wait')
}

function finishHost(session: GameSession, initial: SessionResponse) {
  let response = initial
  for (let step = 0; step < 10 && response.interaction.stateId === 'wait'; step++) {
    const interaction = response.interaction
    if (interaction.request.kind === 'confirm-next-player') break
    if (interaction.request.kind === 'farm-select' && interaction.request.farm.farmType === 'plow') {
      response = session.commitSelectionChoice(interaction.playerIndex, { tile: interaction.request.farm.selectableTiles[0]! })
    } else if (interaction.request.kind === 'animal-reorg') {
      const house = interaction.request.zones.find(zone => zone.zoneType === 'house')
      const zones = interaction.request.zones.map(zone => ({ ...zone,
        animalType: zone.id === house?.id ? 'sheep' : null,
        animalCount: zone.id === house?.id ? 1 : 0,
      }))
      response = session.resolveChoice(interaction.playerIndex, 'confirm', { zones })
    } else response = choose(session, response, option => ['__skip__', '__done__', '__pass__'].includes(option.value))
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

function precedesHost(response: SessionResponse, card: string, type: 'farm.roomBuilt' | 'farm.renovated' | 'worker.placed' | 'resource.exchanged') {
  const effect = response.state.events.findIndex(event => event.type === type && event.sourceCardId === card)
  const host = response.state.events.findIndex(event => event.type === 'resource.moved' && !event.sourceCardId)
  expect(effect).toBeGreaterThanOrEqual(0)
  expect(host).toBeGreaterThan(effect)
  expect(response.state.log.some(log => log.key === 'log.cardTriggered' && log.params?.cardId === card)).toBe(true)
  expect(response.scores).toHaveLength(response.state.players.length)
}

const extraActions: Array<{ card: string; space: string; resources: Partial<Resource> }> = [
  { card: 'A149_HouseArtist', space: 'traveling-players', resources: { wood: 5, reed: 1 } },
  { card: 'B087_Cottager', space: 'day-laborer', resources: { wood: 5, reed: 2 } },
  { card: 'B092_LittleStickKnitter', space: 'sheep-market', resources: {} },
  { card: 'B108_OvenFiringBoy', space: 'forest', resources: { grain: 1 } },
  { card: 'C026_Flail', space: 'farmland', resources: { grain: 1 } },
]

function prepared(scenario: typeof extraActions[number], configure?: (state: GameState) => void) {
  return make(scenario.card, scenario.resources, state => {
    const owner = state.players[0]!
    if (scenario.card === 'B092_LittleStickKnitter') {
      owner.rooms = 3
      owner.roomTiles.push({ row: 1, col: 1 })
    }
    if (scenario.card === 'B108_OvenFiringBoy' || scenario.card === 'C026_Flail') owner.improvements.push('Major_Fireplace1')
    configure?.(state)
  })
}

describe('extra actions before their action-space host', () => {
  it.each(extraActions)('$card can skip its extra action and complete the host', scenario => {
    const session = prepared(scenario)
    const pending = session.takeAction(0, scenario.space)
    expect(getChoiceOptions(pending).some(option => option.value === '__skip__')).toBe(true)
    const response = finishHost(session, choose(session, pending, option => option.value === '__skip__'))
    expect(response.state.events.filter(event => event.type === 'card.triggered' && event.sourceCardId === scenario.card)).toHaveLength(0)
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === scenario.card)).toHaveLength(0)
    expect(response.state.players[0]!.rooms).toBe(scenario.card === 'B092_LittleStickKnitter' ? 3 : 2)
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(response.state.players[0]!.resources.grain).toBe(scenario.resources.grain ?? 0)
  })

  it.each(extraActions.flatMap(scenario => ['hand', 'opponent', 'unrelated'].map(mode => ({ ...scenario, mode }))))('$card does not grant an extra action for $mode', scenario => {
    const session = prepared(scenario, state => {
      const owner = state.players[0]!
      if (scenario.mode === 'hand') {
        if (scenario.card === 'C026_Flail') { owner.minorPlayed = []; owner.minorHand = [scenario.card] }
        else { owner.occupationPlayed = []; owner.occupationHand = [scenario.card] }
      }
      if (scenario.mode === 'opponent') state.currentPlayerIndex = 1
    })
    const response = finishHost(session, session.takeAction(scenario.mode === 'opponent' ? 1 : 0,
      scenario.mode === 'unrelated' ? 'reed-bank' : scenario.space))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.events.filter(event => event.type === 'card.triggered' && event.sourceCardId === scenario.card)).toHaveLength(0)
  })

  it.each(['round', 'room'])('B092 does not grow without the required $0', condition => {
    const session = prepared(extraActions[2]!, state => {
      if (condition === 'round') state.round = 4
      else { state.players[0]!.rooms = 2; state.players[0]!.roomTiles.pop() }
    })
    const response = finishHost(session, session.takeAction(0, 'sheep-market'))
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })

  it.each(extraActions.filter(scenario => scenario.resources.grain).flatMap(scenario => ['grain', 'oven'].map(missing => ({ ...scenario, missing }))))('$card cannot bake without $missing', scenario => {
    const session = prepared(scenario, state => {
      if (scenario.missing === 'grain') state.players[0]!.resources.grain = 0
      else state.players[0]!.improvements = []
    })
    const response = finishHost(session, session.takeAction(0, scenario.space))
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.events.filter(event => event.type === 'resource.exchanged' && event.sourceCardId === scenario.card)).toHaveLength(0)
  })

  it('A149 builds a room at its discounted reed cost before collecting Traveling Players food', () => {
    const card = 'A149_HouseArtist'
    const session = make(card, { wood: 5, reed: 1 })
    let response = session.takeAction(0, 'traveling-players')
    beforeHost(response)
    for (let step = 0; step < 4 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'; step++) response = accept(session, response)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } } })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('Expected room selection')
    response = session.commitSelectionChoice(0, { rooms: [response.interaction.request.farm.selectableTiles[0]!] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0, food: 2 })
    precedesHost(response, card, 'farm.roomBuilt')
    const payment = response.state.events.findIndex(event => event.type === 'resource.paid' && event.sourceCardId === card)
    const collected = response.state.events.findIndex(event => event.type === 'resource.moved' && !event.sourceCardId)
    expect(payment).toBeGreaterThanOrEqual(0)
    expect(collected).toBeGreaterThan(payment)
  })

  it('B087 renovates and pays before Day Laborer grants food', () => {
    const card = 'B087_Cottager'
    const session = make(card, { clay: 2, reed: 1 })
    const pending = session.takeAction(0, 'day-laborer')
    beforeHost(pending)
    const response = choose(session, pending, option => option.labelKey === 'actions.renovate-house.name')
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0, food: 2 })
    precedesHost(response, card, 'farm.renovated')
  })

  it('B092 grows a newborn with room before Sheep Market collects its sheep', () => {
    const card = 'B092_LittleStickKnitter'
    const session = make(card, {}, state => {
      state.players[0]!.rooms = 3
      state.players[0]!.roomTiles.push({ row: 1, col: 1 })
    })
    const pending = session.takeAction(0, 'sheep-market')
    beforeHost(pending)
    expect(pending.interaction.stateId === 'wait' && pending.interaction.request.kind).toBe('choice')
    const response = finishHost(session, accept(session, pending))
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.players[0]!.workers.filter(worker => worker.isNewborn)).toHaveLength(1)
    expect(response.state.players[0]!.resources.sheep).toBe(1)
    precedesHost(response, card, 'worker.placed')
  })

  it('B108 bakes its existing grain before Forest collects wood', () => {
    const card = 'B108_OvenFiringBoy'
    const session = make(card, { grain: 1 }, state => state.players[0]!.improvements.push('Major_Fireplace1'))
    let response = session.takeAction(0, 'forest')
    beforeHost(response)
    for (let step = 0; step < 5 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'; step++) response = accept(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2, wood: 3 })
    precedesHost(response, card, 'resource.exchanged')
  })

  it.each(['farmland', 'cultivation'])('C026 bakes before %s plows its field', space => {
    const card = 'C026_Flail'
    const session = make(card, { grain: 1 }, state => state.players[0]!.improvements.push('Major_Fireplace1'))
    let response = session.takeAction(0, space)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('choice')
    expect(response.state.players[0]!.fields).toHaveLength(0)
    for (let step = 0; step < 5 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'; step++) response = accept(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
    expect(response.state.players[0]!.fields).toHaveLength(0)
    response = finishHost(session, response)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    const baked = response.state.events.findIndex(event => event.type === 'resource.exchanged' && event.sourceCardId === card)
    const plowed = response.state.events.findIndex(event => event.type === 'farm.fieldPlowed' && !event.sourceCardId)
    expect(baked).toBeGreaterThanOrEqual(0)
    expect(plowed).toBeGreaterThan(baked)
    expect(response.state.log.some(log => log.key === 'log.cardTriggered' && log.params?.cardId === card)).toBe(true)
    expect(response.scores).toHaveLength(2)
  })

  it('B087 builds and pays for one room before Day Laborer grants food', () => {
    const card = 'B087_Cottager'
    const session = make(card, { wood: 5, reed: 2 })
    const pending = session.takeAction(0, 'day-laborer')
    beforeHost(pending)
    const selection = choose(session, pending, option => option.labelKey === 'actions.construct.name')
    expect(selection.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room', maxSelections: 1 } } })
    if (selection.interaction.stateId !== 'wait' || selection.interaction.request.kind !== 'farm-select') throw new Error('Expected room selection')
    const response = session.commitSelectionChoice(0, { rooms: [selection.interaction.request.farm.selectableTiles[0]!] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0, food: 2 })
    precedesHost(response, card, 'farm.roomBuilt')
  })
})
