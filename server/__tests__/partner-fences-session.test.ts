import { afterEach, describe, expect, it } from 'vitest'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { ActionContext, GameState } from '../../shared/contract/types'
import type { TeamConfiguration } from '../../shared/contract/team'
import { assertRejectedUnchanged } from './_helpers/session-assertions'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const team = { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private', cooperationRules: true } satisfies TeamConfiguration
const square = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
const table = (configure: (state: GameState) => void = () => {}) => {
  const session = createWorkSession({ seed: 1629, options: { playerCount: 4, teamConfig: team }, configure(state) {
    state.round = 14; state.currentPlayerIndex = 0
    for (const player of state.players) {
      player.minorPlayed = []; player.occupationPlayed = []; player.improvements = []; player.cardStates = {}
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
    }
    state.players[0]!.resources.wood = 20
    state.players[2]!.houseType = 'clay'
    configure(state)
  } })
  sessions.push(session)
  return session
}

const SOURCE = '__partner_fence_offer__'
const grantFence = (context: ActionContext, configure: (state: GameState) => void) => {
  const session = table(state => {
    state.players[0]!.minorPlayed = [SOURCE]
    configure(state)
  })
  session.withCtx(() => requireActiveCardRegistry('partner fence test').registerListener({
    id: SOURCE, cardIds: [SOURCE], actions: ['anytime'], phases: ['anytime'],
    handler: () => ({ sourceCard: SOURCE, flow: { type: 'leaf', actionId: 'fence', sourceCard: SOURCE, actionContext: context } }),
  }))
  expect(session.takeAnytimeAction(0, SOURCE).ok).toBe(true)
  return session
}

describe('Partner Build fences', () => {
  it('uses the teammate pieces and geometry, quotes the full price, and charges one protected surcharge', () => {
    const session = table()
    const start = session.takeAction(0, 'fencing')
    expect(start.ok, start.error).toBe(true)
    expect(start.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice', options: [
      { value: 'target-farm:p1' }, { value: 'target-farm:p3' },
    ] } })
    const chosen = session.resolveChoice(0, 'target-farm:p3')
    expect(chosen.ok, chosen.error).toBe(true)
    expect(chosen.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select', farmOwnerPlayerId: 'p3' } })
    expect(chosen.interaction.stateId).toBe('wait')
    if (chosen.interaction.stateId !== 'wait' || !chosen.interaction.requestKey) throw new Error('missing fence request')
    expect(session.quoteFenceSelection(0, chosen.interaction.requestKey, { edges: square })).toEqual({
      requestKey: chosen.interaction.requestKey, woodCost: 6, affordable: true, valid: true, error: null,
    })
    const built = session.commitSelectionChoice(0, { edges: square, palisadeEdges: [] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(14)
    expect(built.state.players[2]!.resources.wood).toBe(0)
    expect(built.state.players[0]!.fenceSegments).toEqual([])
    expect(built.state.players[2]!.fenceSegments).toHaveLength(4)
    expect(built.state.players[2]!.fenceSegments.every(segment => segment.source.ownerPlayerId === 'p3')).toBe(true)
    expect(built.state.players[2]!.pastures).toMatchObject([{ tiles: [{ row: 0, col: 0 }] }])
    expect(built.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'fencing')).toEqual([
      expect.objectContaining({ actorPlayerId: 'p1', resources: { wood: 6 } }),
    ])
    expect(built.state.log).toContainEqual(expect.objectContaining({ key: 'log.partnerFencesBuilt', playerId: 'p1', playerRefs: { owner: 'p3' }, params: expect.objectContaining({ count: 4 }) }))
    expect(built.scores?.find(score => score.playerId === 'p3')?.categories.find(category => category.key === 'pastures')?.total).toBe(1)
  })
  it('lets the farm owner arrange animals after a split, survives restoration, and rejects the builder response', () => {
    const existing = ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2']
    const session = table(state => {
      const owner = state.players[2]!
      owner.resources.sheep = 4
      owner.fenceSegments = existing.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id } }))
      owner.pastures = [{ id: 'old-pasture', tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], animalType: 'sheep', animalCount: 4 }]
    })
    expect(session.takeAction(0, 'fencing').ok).toBe(true)
    expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    let response = session.commitSelectionChoice(0, { edges: ['V-0-1'], palisadeEdges: [] })
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 2, request: { kind: 'animal-reorg' } })
    expect(response.state.players[2]!.resources.sheep).toBe(4)
    expect(response.state.players[0]!.resources.wood).toBe(18)
    const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    sessions.push(restored)
    const pending = restored.getState().interaction
    if (pending.stateId !== 'wait' || pending.request.kind !== 'animal-reorg') throw new Error('missing owner animals')
    let pasture = 0
    const zones = pending.request.zones.map(zone => ({ id: zone.id, zoneType: zone.zoneType,
      animalType: zone.zoneType === 'pasture' ? 'sheep' : null,
      animalCount: zone.zoneType === 'pasture' && pasture++ < 2 ? 2 : 0,
    }))
    assertRejectedUnchanged(restored, () => restored.resolveChoice(0, 'confirm', { zones }))
    const arranged = restored.resolveChoice(2, 'confirm', { zones })
    expect(arranged.ok, arranged.error).toBe(true)
    expect(arranged.state.players[2]!.resources.sheep).toBe(4)
    expect(arranged.state.players[2]!.pastures.map(pasture => pasture.animalCount)).toEqual([2, 2])
    expect(arranged.state.players[0]!.resources.sheep).toBe(0)
  })

  it.each([
    { edges: ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2'], paid: 8 },
    { edges: ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-1', 'V-0-2'], paid: 10 },
  ])('charges the segment-count boundary for $edges.length new pieces', ({ edges, paid }) => {
    const session = table()
    expect(session.takeAction(0, 'fencing').ok).toBe(true)
    expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    const result = session.commitSelectionChoice(0, { edges, palisadeEdges: [] })
    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources.wood).toBe(20 - paid)
    expect(result.state.players[2]!.fenceSegments).toHaveLength(edges.length)
    expect(result.state.players[2]!.resources.wood).toBe(0)
  })

  it('keeps the full surcharge when Mini Pasture makes the ordinary fences free', () => {
    const session = table(state => {
      state.players[0]!.minorHand = ['B002_MiniPasture']
      state.players[0]!.resources.food = 2
      state.players[0]!.resources.wood = 2
    })
    let response = session.takeAction(0, 'meeting-place')
    for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step += 1) {
      if (response.interaction.request.kind !== 'choice' || response.interaction.request.options.some(option => option.value === 'target-farm:p3')) break
      const option = response.interaction.request.options.find(option => option.value === 'B002_MiniPasture')
        ?? response.interaction.request.options.find(option => option.value !== '__skip__' && !option.disabled)
      if (!option) break
      response = session.resolveChoice(response.interaction.playerIndex, option.value)
    }
    expect(response.ok, response.error).toBe(true)
    const target = session.resolveChoice(0, 'target-farm:p3')
    expect(target.ok, target.error).toBe(true)
    if (target.interaction.stateId !== 'wait' || !target.interaction.requestKey) throw new Error('missing fence request')
    expect(session.quoteFenceSelection(0, target.interaction.requestKey, { edges: square })).toMatchObject({ woodCost: 2, valid: true })
    const built = session.commitSelectionChoice(0, { edges: square, palisadeEdges: [] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
    expect(built.state.players[2]!.fenceSegments).toHaveLength(4)
    expect(built.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'fencing')).toEqual([
      expect.objectContaining({ actorPlayerId: 'p1', resources: { wood: 2 } }),
    ])
  })

  it('adds the surcharge after the Open Air Farmer fixed price and spends the builder stable supply', () => {
    const session = table(state => {
      state.players[0]!.occupationHand = ['B149_OpenAirFarmer']
      state.players[0]!.resources.wood = 4
    })
    let response = session.takeAction(0, 'lessons')
    for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step += 1) {
      if (response.interaction.request.kind !== 'choice' || response.interaction.request.options.some(option => option.value === 'target-farm:p3')) break
      const option = response.interaction.request.options.find(option => option.value === 'B149_OpenAirFarmer')
        ?? response.interaction.request.options.find(option => option.value !== '__skip__' && !option.disabled)
      if (!option) break
      response = session.resolveChoice(response.interaction.playerIndex, option.value)
    }
    expect(response.ok, response.error).toBe(true)
    const target = session.resolveChoice(0, 'target-farm:p3')
    expect(target.ok, target.error).toBe(true)
    const edges = ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2']
    if (target.interaction.stateId !== 'wait' || !target.interaction.requestKey) throw new Error('missing fence request')
    expect(session.quoteFenceSelection(0, target.interaction.requestKey, { edges })).toMatchObject({ woodCost: 4, valid: true })
    const built = session.commitSelectionChoice(0, { edges, palisadeEdges: [] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[2]!.pastures).toMatchObject([{ tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }] }])
    expect(built.state.players[0]!.pastures).toEqual([])
    expect(built.state.players[0]!.supplyTokensConsumed?.stable).toBe(3)
    expect(built.state.players[2]!.supplyTokensConsumed?.stable ?? 0).toBe(0)
  })

  it('renovates only the builder before choosing a fence farm and keeps the action-space discount', () => {
    const session = table(state => {
      Object.assign(state.players[0]!.resources, { wood: 3, clay: 2, reed: 1 })
      state.players[0]!.minorPlayed = ['D082_HuntingTrophy']
    })
    let response = session.takeAction(0, 'farm-redevelopment')
    for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step += 1) {
      if (response.interaction.request.kind !== 'choice' || response.interaction.request.options.some(option => option.value === 'target-farm:p3')) break
      const option = response.interaction.request.options.find(option => option.value !== '__skip__' && !option.disabled)
      if (!option) break
      response = session.resolveChoice(response.interaction.playerIndex, option.value)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
    expect(response.state.players[2]!.houseType).toBe('clay')
    const target = session.resolveChoice(0, 'target-farm:p3')
    expect(target.ok, target.error).toBe(true)
    if (target.interaction.stateId !== 'wait' || !target.interaction.requestKey) throw new Error('missing fence request')
    expect(session.quoteFenceSelection(0, target.interaction.requestKey, { edges: square })).toMatchObject({ woodCost: 3, valid: true })
    let built = session.commitSelectionChoice(0, { edges: square, palisadeEdges: [] })
    if (built.interaction.stateId === 'wait' && built.interaction.request.kind === 'choice') {
      built = session.resolveChoice(0, built.interaction.request.options.find(option => !option.disabled)!.value)
    }
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[2]!.fenceSegments).toHaveLength(4)
  })

  it('pays the protected fee once using builder inventory plus live card-provided wood', () => {
    const session = table(state => {
      state.players[0]!.resources.wood = 1
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 1
    })
    session.actionHooks.register({ id: '__partner_fence_provider__', actions: ['fence'], phases: ['computeCosts'], handler: () => ({
      costs: { wood: -4 },
      paymentResourceProviders: [{ key: 'test:wood', sourceCard: '__test_wood_provider__', available: 1,
        covers: [{ resource: 'wood', costAmount: 1, paymentAmount: 1 }],
        consume: { type: 'actionSpace', spaceId: 'forest', resource: 'wood' },
      }],
    }) })
    expect(session.takeAction(0, 'fencing').ok).toBe(true)
    const target = session.resolveChoice(0, 'target-farm:p3')
    expect(target.ok, target.error).toBe(true)
    if (target.interaction.stateId !== 'wait' || !target.interaction.requestKey) throw new Error('missing fence request')
    expect(session.quoteFenceSelection(0, target.interaction.requestKey, { edges: square })).toMatchObject({ woodCost: 2, valid: true })
    const built = session.commitSelectionChoice(0, { edges: square, palisadeEdges: [] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood).toBe(0)
    expect(built.state.players[2]!.resources.wood).toBe(0)
    expect(built.state.players[2]!.fenceSegments).toHaveLength(4)
  })

  it.each(['farm-choice', 'geometry'] as const)('resumes a retained partner fence at the $0 step', stage => {
    const session = table()
    expect(session.takeAction(0, 'fencing').ok).toBe(true)
    if (stage === 'geometry') expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    sessions.push(restored)
    if (stage === 'farm-choice') expect(restored.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    const before = restored.getState()
    if (before.interaction.stateId !== 'wait' || !before.interaction.requestKey) throw new Error('missing fence request')
    expect(restored.quoteFenceSelection(0, before.interaction.requestKey, { edges: square })).toMatchObject({ woodCost: 6, valid: true })
    const built = restored.commitSelectionChoice(0, { edges: square, palisadeEdges: [] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(14)
    expect(built.state.players[2]!.fenceSegments).toHaveLength(4)
  })

  it('consumes only the builder reserved card pieces and keeps the target copy untouched', () => {
    const session = grantFence({ fenceSupplyReservations: { [SOURCE]: { counterKey: 'fences', selectedCount: 2 } } }, state => {
      state.players[0]!.resources.wood = 4
      state.players[0]!.cardStates[SOURCE] = { counters: { fences: 2 } }
      state.players[2]!.cardStates[SOURCE] = { counters: { fences: 8 } }
    })
    const target = session.resolveChoice(0, 'target-farm:p3')
    expect(target.ok, target.error).toBe(true)
    if (target.interaction.stateId !== 'wait' || !target.interaction.requestKey) throw new Error('missing fence request')
    expect(session.quoteFenceSelection(0, target.interaction.requestKey, { edges: square })).toMatchObject({ woodCost: 4, valid: true })
    const built = session.commitSelectionChoice(0, { edges: square })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[0]!.cardStates[SOURCE]!.counters!.fences).toBe(0)
    expect(built.state.players[2]!.cardStates[SOURCE]!.counters!.fences).toBe(8)
  })

  it('keeps borrowed source provenance separate from the target farm and still charges the fee', () => {
    const session = grantFence({ fencePolicy: { sourcePolicy: { kind: 'borrowed', donorCaps: { p2: 4 } }, costPolicy: { fence: { wood: 0 }, fixedWood: 2 } } }, state => {
      state.players[0]!.resources.wood = 4
    })
    const target = session.resolveChoice(0, 'target-farm:p3')
    expect(target.ok, target.error).toBe(true)
    if (target.interaction.stateId !== 'wait' || !target.interaction.requestKey) throw new Error('missing fence request')
    const fenceSources = Object.fromEntries(square.map(edge => [edge, 'p2']))
    expect(session.quoteFenceSelection(0, target.interaction.requestKey, { edges: square, fenceSources })).toMatchObject({ woodCost: 4, valid: true })
    const built = session.commitSelectionChoice(0, { edges: square, fenceSources })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[2]!.fenceSegments).toHaveLength(4)
    expect(built.state.players[2]!.fenceSegments.every(segment => segment.source.kind === 'borrowed' && segment.source.ownerPlayerId === 'p2')).toBe(true)
    expect(built.state.players[1]!.supplyTokensConsumed?.fence).toBe(4)
    expect(built.state.players[2]!.supplyTokensConsumed?.fence ?? 0).toBe(0)
  })

  it('resumes the selected payment with its original target, fee and source identity', () => {
    const session = table(state => {
      Object.assign(state.players[0]!.resources, { wood: 6, food: 1 })
      state.players[0]!.activeModifiers = [{ type: 'trade', cardId: '__test_fence_food__', appliesTo: ['fencing'], from: { food: 1 }, to: { wood: 1 }, max: 1 }]
    })
    expect(session.takeAction(0, 'fencing').ok).toBe(true)
    expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    const pending = session.commitSelectionChoice(0, { edges: square })
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, promptKey: 'prompt.selectPayment' })
    expect(pending.state.players[2]!.fenceSegments).toEqual([])
    const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    sessions.push(restored)
    const interaction = restored.getState().interaction
    if (interaction.stateId !== 'wait' || interaction.request.kind !== 'choice') throw new Error('missing payment choice')
    const option = interaction.request.options.find(option => option.labelParams?.resourcesPaid?.food === 1)
    if (!option) throw new Error('missing food payment')
    assertRejectedUnchanged(restored, () => restored.resolveChoice(2, option.value))
    const built = restored.resolveChoice(0, option.value)
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
    expect(built.state.players[2]!.resources.wood).toBe(0)
    expect(built.state.players[2]!.fenceSegments).toHaveLength(4)
    expect(built.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'fencing')).toEqual([
      expect.objectContaining({ actorPlayerId: 'p1', resources: { wood: 5, food: 1 } }),
    ])
  })

  it('reads field-adjacency discounts from the target farm while keeping the source card on the builder', () => {
    const session = table(state => {
      state.players[0]!.minorHand = ['C016_FieldFences']
      state.players[0]!.resources.food = 2
      state.players[0]!.resources.wood = 5
      state.players[2]!.fields = [{ row: 0, col: 1, stacks: [] }]
    })
    let response = session.takeAction(0, 'meeting-place')
    for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step += 1) {
      if (response.interaction.request.kind !== 'choice') break
      if (response.interaction.request.options.some(option => option.value === 'target-farm:p3')) break
      const choose = response.interaction.request.options.find(option => option.value === 'C016_FieldFences')
        ?? response.interaction.request.options.find(option => option.value !== '__skip__' && !option.disabled)
      if (!choose) break
      response = session.resolveChoice(response.interaction.playerIndex, choose.value)
    }
    expect(response.ok, response.error).toBe(true)
    expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    const built = session.commitSelectionChoice(0, { edges: square, palisadeEdges: [] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[0]!.resources.food).toBe(0)
    expect(built.state.players[2]!.fenceSegments).toHaveLength(4)
  })

  it('applies the builder Carpenter Apprentice free band to the target thirteenth to fifteenth pieces', () => {
    const session = table(state => {
      state.players[0]!.occupationPlayed = ['C088_CarpentersApprentice']
      state.players[0]!.resources.wood = 1
      const owner = state.players[2]!
      const tiles = [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 1, col: 2 }, { row: 1, col: 3 }]
      const edges = new Set<string>()
      for (const tile of tiles) {
        edges.add(`H-${tile.row}-${tile.col}`); edges.add(`H-${tile.row + 1}-${tile.col}`)
        edges.add(`V-${tile.row}-${tile.col}`); edges.add(`V-${tile.row}-${tile.col + 1}`)
      }
      owner.fenceSegments = [...edges].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id } }))
      owner.pastures = tiles.map((tile, index) => ({ id: `pasture-${index}`, tiles: [tile], animalType: null, animalCount: 0 }))
    })
    expect(session.takeAction(0, 'fencing').ok).toBe(true)
    const chosen = session.resolveChoice(0, 'target-farm:p3')
    expect(chosen.ok, chosen.error).toBe(true)
    const built = session.commitSelectionChoice(0, { edges: ['H-0-4', 'H-1-4', 'V-0-5'], palisadeEdges: [] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[2]!.fenceSegments).toHaveLength(15)
    expect(built.state.players[0]!.fenceSegments).toEqual([])
  })

})
