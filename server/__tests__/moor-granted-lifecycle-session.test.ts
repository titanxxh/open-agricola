import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import type { GameState } from '../../shared/contract/types'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { MoorSpecialActionId } from '../../shared/moor/types'

const TOOL_SHED = 'M055_ToolShed'
const RIGHTS = 'M056_PeatCuttingRights'
const FERTILIZER = 'M112_PeatAshFertilizer'
const MOOR = { row: 2, col: 0, kind: 'moor' as const }
const FOREST = { row: 0, col: 0, kind: 'forest' as const }
const sessions: GameSession[] = []

function setup(cards: string[], configure?: (state: GameState) => void) {
  const session = createWorkSession({ seed: 1293, options: {
    playerCount: 2, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
  }, configure: state => {
    state.round = 7
    state.currentPlayerIndex = 0
    for (const player of state.players) {
      for (const resource of Object.keys(player.resources)) Reflect.set(player.resources, resource, 0)
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.farmTerrain = [{ ...MOOR }, { ...FOREST }]
      player.fields = []
      player.pastures = []
      player.stableTiles = []
      player.roomTiles = [{ row: 2, col: 3 }, { row: 2, col: 4 }]
      player.rooms = 2
      setWorkersAtHome(state, player, 2)
    }
    state.players[0]!.minorPlayed = cards
    state.players[0]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] }]
    for (const space of state.actionSpaces) space.takenBy = []
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

function choose(session: GameSession, response: SessionResponse, sourceCard: string) {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard })
  const option = response.interaction.request.options.find(option => option.value !== '__skip__')
  if (!option) throw new Error(`No choice for ${sourceCard}`)
  return session.resolveChoice(response.interaction.playerIndex, option.value)
}

function takeSlashAndBurn(session: GameSession) {
  const card = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('slash-and-burn'))
  if (!card) throw new Error('Missing terrain card')
  return session.takeSpecialAction(0, card.id, 'slash-and-burn', { tile: FOREST })
}

function expectGrowthBeforePeat(response: SessionResponse) {
  const player = response.state.players[0]!
  expect(player.fields.find(field => field.row === 0 && field.col === 1)?.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  expect(player.resources.fuel).toBe(3)
  expect(player.farmTerrain).not.toContainEqual(MOOR)
  const growth = response.state.events.filter(event => event.type === 'farm.cropAdded')
  expect(growth).toHaveLength(1)
  expect(growth[0]).toMatchObject({ sourceCardId: FERTILIZER })
  const growthIndex = response.state.events.findIndex(event => event.type === 'farm.cropAdded')
  const peatIndex = response.state.events.findIndex(event => event.type === 'farm.terrainChanged' && event.sourceActionId === 'cut-peat')
  expect(growthIndex).toBeGreaterThanOrEqual(0)
  expect(peatIndex).toBeGreaterThan(growthIndex)
  expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.actionDetail', params: expect.objectContaining({ detailParts: expect.objectContaining({ gains: { fuel: 3 } }) }) }))
  expect(response.scores?.find(score => score.playerId === player.id)?.categories.find(category => category.key === 'grains'))
    .toMatchObject({ quantity: 1, total: 1 })
}

function selectTrigger(session: GameSession, response: SessionResponse, cardId: string) {
  expect(response.interaction.request.kind).toBe('select-trigger')
  const option = response.interaction.request.options.find(option => option.sourceCard === cardId)
  if (!option) throw new Error(`No trigger for ${cardId}`)
  response = session.resolveChoice(0, option.value)
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.sourceCard === cardId && response.interaction.request.options?.some(option => option.value === '__skip__')) {
    response = choose(session, response, cardId)
  }
  return response
}

function assertRejected(session: GameSession, command: () => SessionResponse) {
  const before = JSON.stringify(serializeSessionSnapshot(session.state, session))
  const response = session.getState()
  const rejected = command()
  expect(rejected.ok).toBe(false)
  expect(JSON.stringify(serializeSessionSnapshot(session.state, session))).toBe(before)
  expect(session.getState().interaction).toEqual(response.interaction)
  expect(session.getState().scores).toEqual(response.scores)
}

function restore(session: GameSession) {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
  sessions.push(restored)
  expect(restored.getState().interaction).toEqual(session.getState().interaction)
  return restored
}

afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

describe('card-granted Moor special-action lifecycle', () => {
  it('M055 grants Cut Peat with M112 before the terrain commits and uses only the outer card', () => {
    const session = setup([TOOL_SHED, FERTILIZER])
    let response = choose(session, takeSlashAndBurn(session), TOOL_SHED)
    if (response.interaction.request.options?.some(option => option.value === 'action:cut-peat:2:0')) {
      response = session.resolveChoice(0, 'action:cut-peat:2:0')
    }
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: FERTILIZER })
    expect(response.state.players[0]!.resources.fuel).toBe(0)
    response = choose(session, response, FERTILIZER)
    expectGrowthBeforePeat(response)
    expect(response.state.players[0]!.cardStates[TOOL_SHED]?.counters?.usage).toBe(7)
    expect(response.state.players[0]!.fields).toContainEqual({ row: 0, col: 0, stacks: [] })
    expect(response.state.farmersOfTheMoor!.specialActionCards.filter(card => card.location.kind !== 'market')).toHaveLength(1)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(2)
    expect(response.state.actionSpaces.every(space => space.takenBy.length === 0)).toBe(true)
  })
  it('M056 prepares its due-round action, grows before Cut Peat and consumes the offer once', () => {
    const session = setup([RIGHTS, FERTILIZER], state => {
      state.round = 5
      state.players[0]!.cardStates[RIGHTS] = { extraData: { scheduledOffers: [{
        id: 'rights-round6', kind: 'moor-special-action', dueRound: 6,
        actionId: 'cut-peat', cost: {}, consumed: false,
      }] } }
      for (const player of state.players) markAllWorkersUsed(state, player)
    })
    let response = choose(session, session.performRoundEnd(), RIGHTS)
    expect(response.state.round).toBe(6)
    const option = response.interaction.request.options.find(option => option.value.startsWith('offer:') && option.value.endsWith(':cut-peat:2:0'))
    if (!option) throw new Error('Missing scheduled Cut Peat')
    assertRejected(session, () => session.resolveChoice(1, option.value))
    assertRejected(session, () => session.resolveChoice(0, `${option.value}stale`))
    response = session.resolveChoice(0, option.value)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: FERTILIZER })
    expect(response.state.players[0]!.resources.fuel).toBe(0)
    expect(response.state.players[0]!.cardStates[RIGHTS]?.extraData?.scheduledOffers).toEqual([
      expect.objectContaining({ consumed: false }),
    ])
    response = choose(session, response, FERTILIZER)
    expectGrowthBeforePeat(response)
    expect(response.state.players[0]!.cardStates[RIGHTS]?.extraData?.scheduledOffers).toEqual([
      expect.objectContaining({ consumed: true, consumedRound: 6 }),
    ])
    expect(response.state.farmersOfTheMoor!.specialActionCards.filter(card => card.location.kind !== 'market')).toHaveLength(1)
    assertRejected(session, () => session.resolveChoice(0, option.value))
    expect(session.state.players[0]!.resources.fuel).toBe(3)
  })

  it.each([TOOL_SHED, FERTILIZER])('Cut Peat chooses its two before sources, first %s', first => {
    const session = setup([TOOL_SHED, FERTILIZER])
    const card = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('cut-peat'))!
    let response = session.takeSpecialAction(0, card.id, 'cut-peat', { tile: MOOR })
    expect(response.interaction.request.kind).toBe('select-trigger')
    expect(response.interaction.request.options.map(option => option.sourceCard).filter(Boolean)).toEqual([TOOL_SHED, FERTILIZER])
    response = selectTrigger(session, response, first)
    if (first === TOOL_SHED) {
      if (response.interaction.request.options?.some(option => option.value === 'action:slash-and-burn:0:0')) {
        response = session.resolveChoice(0, 'action:slash-and-burn:0:0')
        expect(response.ok, response.error).toBe(true)
      }
      response = selectTrigger(session, response, FERTILIZER)
    } else {
      response = selectTrigger(session, response, TOOL_SHED)
      if (response.interaction.request.options?.some(option => option.value === 'action:slash-and-burn:0:0')) {
        response = session.resolveChoice(0, 'action:slash-and-burn:0:0')
      }
    }
    expect(response.ok, response.error).toBe(true)
    expectGrowthBeforePeat(response)
    expect(response.state.players[0]!.cardStates[TOOL_SHED]?.counters?.usage).toBe(7)
    expect(response.state.players[0]!.fields).toHaveLength(2)
  })

  it('can pass both optional before sources without spending Tool Shed usage or growing crops', () => {
    const session = setup([TOOL_SHED, FERTILIZER])
    const card = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('cut-peat'))!
    let response = session.takeSpecialAction(0, card.id, 'cut-peat', { tile: MOOR })
    expect(response.interaction.request.kind).toBe('select-trigger')
    response = session.resolveChoice(0, '__pass__')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.sourceCard).toBe(TOOL_SHED)
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toEqual([{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] }])
    expect(response.state.players[0]!.resources.fuel).toBe(3)
    expect(response.state.players[0]!.cardStates[TOOL_SHED]?.counters?.usage).toBeUndefined()
    expect(response.state.events.filter(event => event.type === 'farm.cropAdded')).toHaveLength(0)
  })

  it('restores both the inner action selection and its before window, rejects invalid inputs, and replays once after undo', () => {
    let session = setup([TOOL_SHED, FERTILIZER], state => {
      state.players[0]!.farmTerrain!.push({ row: 1, col: 0, kind: 'moor' })
    })
    let response = choose(session, takeSlashAndBurn(session), TOOL_SHED)
    expect(response.interaction.request.options.map(option => option.value)).toContain('action:cut-peat:2:0')
    session = restore(session)
    assertRejected(session, () => session.resolveChoice(1, 'action:cut-peat:2:0'))
    assertRejected(session, () => session.resolveChoice(0, 'action:cut-peat:2:4'))
    assertRejected(session, () => session.resolveChoice(0, 'action:cut-peat:2:4'))
    response = session.resolveChoice(0, 'action:cut-peat:2:0')
    expect(response.interaction.sourceCard).toBe(FERTILIZER)
    session = restore(session)
    assertRejected(session, () => session.resolveChoice(1, 'anything'))
    assertRejected(session, () => session.resolveChoice(0, 'stale'))
    response = choose(session, session.getState(), FERTILIZER)
    expectGrowthBeforePeat(response)
    response = session.undoStep(0)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.sourceCard).toBe(FERTILIZER)
    expect(response.state.players[0]!.resources.fuel).toBe(0)
    response = choose(session, response, FERTILIZER)
    expectGrowthBeforePeat(response)
    response = session.undoAction(0)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toEqual([{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] }])
    expect(response.state.players[0]!.cardStates[TOOL_SHED]?.counters?.usage).toBeUndefined()
    response = choose(session, takeSlashAndBurn(session), TOOL_SHED)
    expect(response.ok, response.error).toBe(true)
    response = session.resolveChoice(0, 'action:cut-peat:2:0')
    response = choose(session, response, FERTILIZER)
    expectGrowthBeforePeat(response)
  })

  for (const borrowed of [false, true]) it.each<MoorSpecialActionId>(['cut-peat', 'fell-trees', 'slash-and-burn', 'hiring-fair', 'horse-market', 'black-market', 'illicit-work'])(
    `%s takes a real card through before and after once without placing a worker, borrowed=${borrowed}`, actionId => {
      const source = '__test_moor_lifecycle_probe__'
      const session = setup([source], state => {
        const player = state.players[0]!
        Object.assign(player.resources, { food: borrowed ? 3 : 1, fuel: 1, wood: 2, clay: 2 })
        if (borrowed) state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes(actionId))!.location = { kind: 'playerFaceUp', playerId: state.players[1]!.id }
        player.minorHand = ['A032_Manger']
      })
      session.withCtx(() => {
        const registry = requireActiveCardRegistry('moor-lifecycle-session')
        for (const phase of ['before', 'after'] as const) registry.registerListener({
          id: `test-moor-${phase}-${actionId}`, cardIds: [source], actions: [actionId], phases: [phase], mandatory: true,
          handler: context => {
            expect(context.actionId).toBe(actionId)
            if (phase === 'before') expect(context.extraData?.payload).toEqual(
              actionId === 'cut-peat' ? { tile: MOOR } : actionId === 'fell-trees' || actionId === 'slash-and-burn' ? { tile: FOREST } : {},
            )
            return { flow: { type: 'leaf', actionId: 'gain', sourceCard: source, params: { stone: 1 } } }
          },
        })
      })
      const card = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes(actionId))!
      const payload = actionId === 'cut-peat' ? { tile: MOOR } : actionId === 'fell-trees' || actionId === 'slash-and-burn' ? { tile: FOREST } : {}
      const otherResources = structuredClone(session.state.players[1]!.resources)
      let response = session.takeSpecialAction(0, card.id, actionId, payload)
      for (let step = 0; step < 10 && response.interaction.stateId === 'wait' && response.interaction.request.kind !== 'confirm-next-player'; step++) {
        expect(response.ok, response.error).toBe(true)
        if (response.interaction.request.kind === 'animal-reorg') {
          response = session.resolveChoice(0, 'confirm', { zones: [{ id: 'house:2-3', zoneType: 'house', animalType: 'horse', animalCount: 1 }] })
        } else {
          const options = response.interaction.request.options
          const option = options.find(option => option.value === 'A032_Manger' || option.value === 'Major_Fireplace1')
            ?? options.find(option => option.value !== '__skip__' && option.value !== 'cancel')
          if (!option) throw new Error(`No executable ${actionId} continuation`)
          response = session.resolveChoice(0, option.value)
        }
      }
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.stone).toBe(2)
      expect(response.state.farmersOfTheMoor!.specialActionCards.find(entry => entry.id === card.id)?.location).toEqual({ kind: borrowed ? 'playerFaceDown' : 'playerFaceUp', playerId: 'p1' })
      expect(response.state.players[1]!.resources).toEqual(otherResources)
      expect(workersAvailable(response.state, response.state.players[0]!)).toBe(2)
      expect(response.state.actionSpaces.every(space => space.takenBy.length === 0)).toBe(true)
      if (actionId === 'cut-peat') expect(response.state.players[0]!.resources.fuel).toBe(4)
      if (actionId === 'fell-trees') expect(response.state.players[0]!.resources.wood).toBe(4)
      if (actionId === 'slash-and-burn') expect(response.state.players[0]!.fields).toContainEqual({ row: 0, col: 0, stacks: [] })
      if (actionId === 'hiring-fair') expect(response.state.players[0]!.resources.food).toBe(2)
      if (actionId === 'horse-market') expect(response.state.players[0]!.resources).toMatchObject({ food: 0, horse: 1 })
      if (actionId === 'black-market') {
        expect(response.state.players[0]!.minorPlayed).toContain('A032_Manger')
        expect(response.state.players[0]!.resources).toMatchObject({ fuel: 0, wood: 0 })
      }
      if (actionId === 'illicit-work') {
        expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
        expect(response.state.players[0]!.resources).toMatchObject({ fuel: 0, food: 0, clay: 0 })
      }
    },
  )

  it('taking a card alone through M054 leaves the crops, terrain and Moor rewards untouched', () => {
    const implement = 'M054_AgriculturalImplement'
    const session = setup([implement, FERTILIZER])
    let response = session.takeAction(0, 'farmland')
    expect(response.interaction.request.kind).toBe('farm-select')
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    response = choose(session, response, implement)
    expect(response.ok, response.error).toBe(true)
    const terrainCard = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('cut-peat'))!
    response = session.resolveChoice(0, `card:${terrainCard.id}`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toContainEqual({ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] })
    expect(response.state.players[0]!.resources.fuel).toBe(0)
    expect(response.state.players[0]!.farmTerrain).toEqual([MOOR, FOREST])
    expect(response.state.events.filter(event => event.type === 'farm.cropAdded' || event.type === 'farm.terrainChanged')).toEqual([])
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(terrainCard.location).toEqual({ kind: 'playerFaceUp', playerId: 'p1' })
  })

  it('rejects an invalid top-level terrain target before opening any before window', () => {
    const session = setup([TOOL_SHED, FERTILIZER])
    const card = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('cut-peat'))!
    assertRejected(session, () => session.takeSpecialAction(0, card.id, 'cut-peat', { tile: { row: 2, col: 4 } }))
    assertRejected(session, () => session.takeSpecialAction(1, card.id, 'cut-peat', { tile: MOOR }))
    expect(session.state.players[0]!.resources.fuel).toBe(0)
    expect(session.state.events.filter(event => event.type === 'farm.cropAdded' || event.type === 'farm.terrainChanged' || event.type === 'resource.moved')).toHaveLength(0)
    expect(session.state.players[0]!.cardStates).toEqual({})
  })

  it('rechecks the selected action after a mandatory before payment and never dispatches successful after on failure', () => {
    const source = '__test_before_payment__'
    const session = setup([source], state => { state.players[0]!.resources.food = 1 })
    session.withCtx(() => {
      const registry = requireActiveCardRegistry('moor-before-payment-session')
      registry.registerListener({
        id: 'test-moor-before-spend-fee', cardIds: [source], actions: ['horse-market'], phases: ['before'], mandatory: true,
        handler: () => ({ flow: { type: 'leaf', actionId: 'pay', params: { food: 1 }, sourceCard: source } }),
      })
      registry.registerListener({
        id: 'test-moor-after-failed-fee', cardIds: [source], actions: ['horse-market'], phases: ['after'], mandatory: true,
        handler: () => ({ flow: { type: 'leaf', actionId: 'gain', params: { stone: 1 }, sourceCard: source } }),
      })
    })
    const card = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('horse-market'))!
    const response = session.takeSpecialAction(0, card.id, 'horse-market')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.allowedCommands).toContain('undoStep')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, stone: 0, horse: 0 })
    expect(card.location).toEqual({ kind: 'market' })
    expect(response.state.events.filter(event => event.type === 'resource.moved')).toHaveLength(0)
  })

})
