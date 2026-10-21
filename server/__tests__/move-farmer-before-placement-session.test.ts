import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { assertRejectedUnchanged } from './_helpers/session-assertions'

const ARCHWAY = 'D051_Archway'
const STRAW_HAT = 'E010_StrawHat'
const COMB = 'E059_CombandCutter'
const BUCKET = 'D016_WoodenWheyBucket'
const CAMPAIGNER = 'C158_ForestCampaigner'
const HORA = 'A174_MasterHora'
const MOVERS: Array<typeof ARCHWAY | typeof STRAW_HAT> = [ARCHWAY, STRAW_HAT]
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// Approved generic adapter seam: real 2p work Sessions because movement can
// pause in another card's before-placement payment, then resume the target.
function setup({ mover, bonus = COMB, actor = 0, placementCard, prepareMove = true }: {
  mover?: typeof ARCHWAY | typeof STRAW_HAT
  bonus?: typeof COMB | typeof BUCKET
  actor?: number
  placementCard?: typeof CAMPAIGNER | typeof HORA
  prepareMove?: boolean
} = {}) {
  let workerId = ''
  const session = createWorkSession({ seed: 42, options: {
    playerCount: placementCard === CAMPAIGNER ? 4 : placementCard === HORA ? 5 : 2,
  }, configure(state) {
    state.round = mover === STRAW_HAT ? 3 : 1
    state.currentPlayerIndex = actor
    for (const player of state.players) {
      setWorkersAtHome(state, player, 2)
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      Object.assign(player.resources, { food: 20, wood: 0, sheep: 0, boar: 0, cattle: 0, grain: 0, vegetable: 0 })
    }
    const owner = state.players[actor]!
    owner.minorPlayed = [bonus, ...(mover ? [mover] : [])]
    owner.occupationPlayed = placementCard ? [placementCard] : []
    owner.resources.food = 8
    owner.resources.wood = 2
    const sheep = state.actionSpaces.find(space => space.id === 'sheep-market')
    if (!sheep) throw new Error('Missing Sheep Market')
    sheep.resources.sheep = bonus === BUCKET ? 1 : 3
    if (placementCard === CAMPAIGNER) {
      for (const space of state.actionSpaces) space.resources.wood = 0
      const forest = state.actionSpaces.find(space => space.id === 'forest')
      if (!forest) throw new Error('Missing Forest')
      forest.resources.wood = 8
    }
    if (placementCard === HORA) {
      const copse = state.actionSpaces.find(space => space.id === 'copse-56')
      if (!copse) throw new Error('Missing 5p Copse')
      copse.resources.wood = 1
    }
    const worker = owner.workers.find(entry => entry.isActive)
    if (!worker) throw new Error('Missing owner worker')
    workerId = worker.id
    if (mover === ARCHWAY) state.actionSpaces.push(...createPlayerActionSpaces(state))
    if (mover && prepareMove) {
      const source = state.actionSpaces.find(space => space.id === (mover === ARCHWAY ? ARCHWAY : 'farmland'))
      if (!source) throw new Error('Missing move source')
      source.takenBy = [{ playerId: owner.id, workerId }]
      state.players.forEach(player => markAllWorkersUsed(state, player))
    }
  } })
  sessions.push(session)
  return { session, workerId }
}

function startMove(session: GameSession, mover: typeof ARCHWAY | typeof STRAW_HAT, actor = 0) {
  let response = session.performRoundEnd()
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
    response = session.resolveChoice(actor, mover)
    expect(response.ok, response.error).toBe(true)
  }
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
    throw new Error('Expected return-home move decision')
  }
  const accept = response.interaction.request.options.find(option => mover === STRAW_HAT
    ? option.labelKey === 'actions.move-farmer-to-space.name'
    : option.value !== '__skip__')
  if (!accept) throw new Error('Missing move decision')
  response = session.resolveChoice(actor, accept.value)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: actor,
    promptKey: 'ui.interactionMoveFarmerToSpace' })
  return response
}

function rewardEvents(response: SessionResponse) {
  return response.state.events.filter(event => event.type === 'resource.moved'
    && event.sourceCardId === COMB && event.resources.food === 3)
}

describe('moving a farmer runs target before-placement flows', () => {
  it('queries move targets as existing-worker uses before offering them', () => {
    const { session } = setup({ mover: STRAW_HAT })
    const query = 'TEST_MovingForestVeto'
    session.state.players[0]!.minorPlayed.push(query)
    session.withCtx(() => requireActiveCardRegistry('moving-space-query').registerListener({
      id: query, cardIds: [query], actionSpaces: ['forest'], phases: ['isDoable'],
      handler: context => context.actionSpaceUse?.newPlacement === false ? { doable: false } : undefined,
    }))
    const response = startMove(session, STRAW_HAT)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected target choice')
    expect(response.interaction.request.options.map(option => option.value)).not.toContain('forest')
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'forest'))
    expect(session.resolveChoice(0, 'day-laborer').ok).toBe(true)
  })
  it('ordinary Day Laborer gives the three-food before reward and two-food base gain', () => {
    const { session, workerId } = setup()
    const response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(13)
    expect(response.state.actionSpaces.find(space => space.id === 'day-laborer')?.takenBy)
      .toEqual([{ playerId: response.state.players[0]!.id, workerId }])
    expect(rewardEvents(response)).toHaveLength(1)
  })

  it.each(MOVERS)('%s gives the same before reward once for its actual Day Laborer move', mover => {
    const { session, workerId } = setup({ mover })
    startMove(session, mover)
    const response = session.resolveChoice(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(13)
    expect(rewardEvents(response)).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'worker.placed'
      && event.spaceId === 'day-laborer' && event.workerId === workerId && event.viaCardId === mover)).toHaveLength(1)
    expect(response.state.events.some(event => event.type === 'resource.moved'
      && event.sourceActionId === 'gain' && event.sourceCardId === mover && event.resources.food === 2)).toBe(true)
    const baseGain = response.state.events.find(event => event.type === 'resource.moved'
      && event.sourceActionId === 'gain' && event.sourceCardId === mover && event.resources.food === 2)
    expect(rewardEvents(response)[0]!.seq).toBeLessThan(baseGain!.seq)
  })

  it('keeps the mover owner through an optional before-market stable and resumes collection', () => {
    const { session, workerId } = setup({ mover: ARCHWAY, bonus: BUCKET, actor: 1 })
    startMove(session, ARCHWAY, 1)
    let response = session.resolveChoice(1, 'sheep-market')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'choice' } })
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 2, sheep: 0, food: 8 })
    expect(response.state.actionSpaces.find(space => space.id === 'sheep-market')?.resources.sheep).toBe(1)
    expect(response.state.actionSpaces.find(space => space.id === 'sheep-market')?.takenBy)
      .toEqual([{ playerId: response.state.players[1]!.id, workerId }])
    const before = JSON.stringify(response.state)
    const foreign = session.resolveChoice(0, '__skip__')
    expect(foreign.ok).toBe(false)
    expect(JSON.stringify(foreign.state)).toBe(before)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
      throw new Error('Expected optional stable choice')
    }
    const accept = response.interaction.request.options.find(option => option.value !== '__skip__')
    if (!accept) throw new Error('Missing stable accept option')
    response = session.resolveChoice(1, accept.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'farm-select' } })
    response = session.commitSelectionChoice(1, { stables: [{ row: 0, col: 1 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 1, sheep: 1, food: 8 })
    expect(response.state.players[1]!.stableTiles).toEqual([{ row: 0, col: 1 }])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, sheep: 0, food: 20 })
    expect(response.state.events.filter(event => event.type === 'farm.stableBuilt'
      && event.sourceCardId === BUCKET)).toHaveLength(1)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      response = session.resolveChoice(1, 'confirm', { zones: [
        { id: 'stable:0-1', zoneType: 'stable', animalType: 'sheep', animalCount: 1 },
      ] })
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 1, sheep: 1, food: 8 })
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.actionDetail', playerId: response.state.players[1]!.id,
      params: expect.objectContaining({ detailParts: expect.objectContaining({
        costs: { wood: 1 }, effects: { buildStables: 1 },
      }) }),
    }))
    const score = response.scores?.[1]
    if (!score) throw new Error('Expected mover owner score')
    expect(score.categories.find(category => category.key === 'sheeps'))
      .toMatchObject({ quantity: 1, total: 1 })
  })
})

function placeMoveSource(session: GameSession, mover: typeof ARCHWAY | typeof STRAW_HAT) {
  let response = session.takeAction(0, mover === ARCHWAY ? ARCHWAY : 'farmland')
  expect(response.ok, response.error).toBe(true)
  if (mover === STRAW_HAT) {
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0,
      request: { kind: 'farm-select', farm: { farmType: 'plow' } } })
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })
    expect(response.ok, response.error).toBe(true)
  }
  const state = response.state
  state.players.forEach(player => markAllWorkersUsed(state, player))
  session.loadState(state)
  return response
}

function horaPurchase(response: SessionResponse) {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') return
  return response.interaction.request.options.find(option => option.effectPreview?.kind === 'resourceExchange'
    && option.effectPreview.resourcesGained?.vegetable === 1)
}

// Placement-only boundary: C158 requires 4p and A174 requires 5p. First place
// the worker through the public action, then reuse it; movement is space use.
describe('moving an existing worker does not repeat placement-only rewards', () => {
  it.each(MOVERS)('%s keeps the one C158 reward from its original placement', mover => {
    const { session, workerId } = setup({ mover, placementCard: CAMPAIGNER, prepareMove: false })
    const placed = placeMoveSource(session, mover)
    expect(placed.state.players[0]!.resources.food).toBe(mover === ARCHWAY ? 10 : 9)
    expect(placed.state.events.filter(event => event.type === 'resource.moved'
      && event.sourceCardId === CAMPAIGNER && event.resources.food === 1)).toHaveLength(1)
    startMove(session, mover)
    const response = session.resolveChoice(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.events.filter(event => event.type === 'worker.placed'
      && event.spaceId === 'day-laborer' && event.workerId === workerId && event.viaCardId === mover)).toHaveLength(1)
    expect(rewardEvents(response)).toHaveLength(1)
    expect(response.state.players[0]!.resources.food).toBe(mover === ARCHWAY ? 15 : 14)
    expect(response.state.events.filter(event => event.type === 'resource.moved'
      && event.sourceCardId === CAMPAIGNER && event.resources.food === 1)).toHaveLength(1)
  })

  it('ordinary 5p Copse placement still offers A174 and pays for one vegetable', () => {
    const { session, workerId } = setup({ placementCard: HORA })
    let response = session.takeAction(0, 'copse-56')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
      const source = response.interaction.request.options.find(option => option.sourceCard === HORA)!
      response = session.resolveChoice(0, source.value)
    }
    const purchase = horaPurchase(response)
    if (!purchase) throw new Error('Expected ordinary placement vegetable purchase')
    response = session.resolveChoice(0, purchase.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 7, vegetable: 1, wood: 3 })
    expect(response.state.actionSpaces.find(space => space.id === 'copse-56')?.takenBy)
      .toEqual([{ playerId: response.state.players[0]!.id, workerId }])
    expect(response.state.events.filter(event => event.type === 'resource.paid'
      && event.sourceCardId === HORA && event.resources.food === 1)).toHaveLength(1)
  })

  it.each(MOVERS.flatMap(mover => ['copse-56', 'house-building-56'].map(target => ({ mover, target }))))(
    '$mover does not offer A174 for its move to $target', ({ mover, target }) => {
      const { session, workerId } = setup({ mover, placementCard: HORA, prepareMove: false })
      if (target === 'house-building-56') {
        Object.assign(session.state.players[0]!.resources, { wood: 5, reed: 2 })
      }
      placeMoveSource(session, mover)
      startMove(session, mover)
      let response = session.resolveChoice(0, target)
      expect(response.ok, response.error).toBe(true)
      // Exercise any erroneous purchase so resource assertions prove it cannot
      // reward a move, even when the target subsequently has its own pending.
      const extraPurchase = horaPurchase(response)
      if (extraPurchase) {
        response = session.resolveChoice(0, extraPurchase.value)
        expect(response.ok, response.error).toBe(true)
      }
      expect(response.state.events.filter(event => event.type === 'worker.placed'
        && event.spaceId === target && event.workerId === workerId && event.viaCardId === mover)).toHaveLength(1)
      expect(response.state.players[0]!.resources.vegetable).toBe(0)
      expect(response.state.players[0]!.resources.food).toBe(mover === ARCHWAY ? 9 : 8)
      expect(response.state.events.filter(event => (event.type === 'resource.paid' || event.type === 'resource.moved')
        && event.sourceCardId === HORA)).toHaveLength(0)
      if (target === 'copse-56') {
        expect(response.state.players[0]!.resources.wood).toBe(3)
        expect(response.interaction.stateId).toBe('idle')
      } else {
        expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
      }
    },
  )
})
