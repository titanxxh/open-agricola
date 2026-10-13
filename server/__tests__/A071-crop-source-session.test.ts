import { afterEach, describe, expect, it } from 'vitest'
import type { Field, GameState } from '../../shared/contract/types'
import { getLogicalFields } from '../../shared/cards/helpers/card-field'
import { createWorkSession } from './_helpers/session-fixtures'
import type { GameSession, SessionResponse } from '../game/authoritative-session'

const SPADE = 'A071_ClearingSpade'
const WOOD = 'D075_WoodField'
const ROCK = 'E080_RockGarden'
const BEAN = 'B068_Beanfield'
const LETTUCE = 'C070_LettucePatch'
const ROTATION = 'E070_CropRotationField'
const ANYTIME = 'A71-clearing-spade-anytime'
const source = { row: 0, col: 2 }
const target = { row: 0, col: 3 }
const woodTile = { row: -1, col: 4075 }
const stoneTile = { row: -1, col: 5080 }
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// A071 declares its source goods; the shared move continuation retains that
// constraint. The confirmed Session seam covers both selections and undo.
const setup = (configure?: (state: GameState) => void) => {
  const session = createWorkSession({ seed: 42, configure: state => {
    state.round = 5
    state.currentPlayerIndex = 0
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.resources = { food: 20, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
    }
    const player = state.players[0]!
    player.minorPlayed = [SPADE, WOOD]
    player.fields = [{ ...target, stacks: [] }]
    player.cardStates[WOOD] = { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 2 }, null] } }
    configure?.(state)
  } })
  sessions.push(session)
  const response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
  return session
}

const planted = (crop: 'grain' | 'vegetable', remaining = 2): Field => ({ ...source, stacks: [{ kind: crop, remaining }] })
const snapshot = (session: GameSession) => {
  const response = session.getState()
  return JSON.stringify({ state: response.state, interaction: response.interaction, scores: response.scores })
}
const positions = (response: SessionResponse) => {
  const interaction = response.interaction
  if (interaction.stateId !== 'wait' || interaction.request.kind !== 'selection') throw new Error('Expected field selection')
  const selection = interaction.request.selection
  if (selection?.kind !== 'farm-position') throw new Error('Expected farm positions')
  return selection.selectablePositions
}
const start = (session: GameSession) => {
  const response = session.takeAnytimeAction(0, ANYTIME)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'selection' } })
  return response
}
const select = (session: GameSession, position: { row: number; col: number }) => session.commitSelectionChoice(0, { positions: [position] })
const assertRejected = (session: GameSession, command: () => SessionResponse) => {
  const before = snapshot(session)
  expect(command().ok).toBe(false)
  expect(snapshot(session)).toBe(before)
}

describe('A071 only moves grain and vegetable sources through Session', () => {
  it.each([
    { card: WOOD, crop: 'wood', tile: woodTile, slots: 2 },
    { card: ROCK, crop: 'stone', tile: stoneTile, slots: 3 },
  ])('excludes $crop Card Fields and rejects forged invocation', ({ card, crop, tile, slots }) => {
    const session = setup(state => {
      const player = state.players[0]!
      player.minorPlayed = [SPADE, card]
      player.cardStates = { [card]: { extraData: { cardFieldStacks: [{ crop, remaining: 2 }, ...Array.from({ length: slots - 1 }, () => null)] } } }
    })
    expect(session.getState().interaction.anytimeActions.map(action => action.id)).not.toContain(ANYTIME)
    assertRejected(session, () => session.takeAnytimeAction(0, ANYTIME))
    assertRejected(session, () => select(session, tile))
    expect(session.getState().state.events?.filter(event => event.type === 'farm.cropAdded' || event.type === 'farm.cropRemoved')).toEqual([])
  })

  it.each(['grain', 'vegetable'] as const)('moves one %s with literal fields, inventory, events and scores', crop => {
    const session = setup(state => { state.players[0]!.fields.unshift(planted(crop)) })
    const initialResources = { ...session.state.players[0]!.resources }
    expect(positions(start(session))).toEqual([source])
    assertRejected(session, () => session.commitSelectionChoice(1, { positions: [source] }))
    assertRejected(session, () => select(session, woodTile))
    const response = select(session, source)
    expect(response.ok, response.error).toBe(true)
    expect(positions(response)).toEqual([target])
    assertRejected(session, () => session.commitSelectionChoice(1, { positions: [target] }))
    const moved = select(session, target)
    expect(moved.ok, moved.error).toBe(true)
    expect(moved.state.players[0]!.fields).toEqual([
      { ...source, stacks: [{ kind: crop, remaining: 1 }] },
      { ...target, stacks: [{ kind: crop, remaining: 1 }] },
    ])
    expect(moved.state.players[0]!.resources).toEqual(initialResources)
    const events = moved.state.events?.filter(event => event.type === 'farm.cropAdded' || event.type === 'farm.cropRemoved')
    expect(events).toMatchObject([
      { type: 'farm.cropRemoved', sourceCardId: SPADE, crops: [{ location: { kind: 'field', row: 0, col: 2 }, crop, amount: 1 }] },
      { type: 'farm.cropAdded', sourceCardId: SPADE, crops: [{ location: { kind: 'field', row: 0, col: 3 }, crop, amount: 1 }] },
    ])
    expect(events).toHaveLength(2)
    expect(moved.scores?.[0]?.categories.find(category => category.key === (crop === 'grain' ? 'grains' : 'vegetables'))).toMatchObject({ quantity: 2, total: crop === 'grain' ? 1 : 2 })
    expect(moved.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
  })

  it.each([
    { card: BEAN, crop: 'vegetable', tile: { row: -1, col: 2068 } },
    { card: ROTATION, crop: 'grain', tile: { row: -1, col: 5070 } },
  ] as const)('retains a real $crop Card Field source and allowed Card Field destination', ({ card, crop, tile }) => {
    const session = setup(state => {
      const player = state.players[0]!
      player.minorPlayed.push(card, LETTUCE)
      player.cardStates[card] = { extraData: { cardFieldStacks: [{ crop, remaining: 2 }] } }
      player.cardStates[LETTUCE] = { extraData: { cardFieldStacks: [null] } }
    })
    expect(positions(start(session))).toEqual([{ ...tile, sourceCard: card, groupKey: card, cardFieldSlot: 0 }])
    expect(select(session, tile).ok).toBe(true)
    assertRejected(session, () => select(session, woodTile))
    const destination = crop === 'vegetable' ? { row: -1, col: 3070 } : target
    const response = select(session, destination)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[card]?.extraData?.cardFieldStacks).toEqual([{ crop, remaining: 1 }])
    expect(getLogicalFields(response.state.players[0]!).find(field => field.row === destination.row && field.col === destination.col)?.stacks).toEqual([{ kind: crop, remaining: 1 }])
    expect(response.state.players[0]!.resources.food).toBe(20)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it.each(['wood', 'stone'] as const)('rejects a source changed to %s during destination pending', crop => {
    const session = setup(state => { state.players[0]!.fields.unshift(planted('grain')) })
    start(session)
    expect(select(session, source).ok).toBe(true)
    // Simulate the authoritative field changing while the nested choice is open.
    session.state.players[0]!.fields[0]!.stacks = [{ kind: crop, remaining: 2 }]
    assertRejected(session, () => select(session, target))
  })

  it('rejects a source changed to wood during source pending', () => {
    const session = setup(state => { state.players[0]!.fields.unshift(planted('grain')) })
    start(session)
    session.state.players[0]!.fields[0]!.stacks = [{ kind: 'wood', remaining: 2 }]
    assertRejected(session, () => select(session, source))
  })

  it('rejects a reduced source during destination pending', () => {
    const session = setup(state => { state.players[0]!.fields.unshift(planted('grain')) })
    start(session)
    expect(select(session, source).ok).toBe(true)
    session.state.players[0]!.fields[0]!.stacks = [{ kind: 'grain', remaining: 1 }]
    assertRejected(session, () => select(session, target))
  })

  it('rejects the source selection if all destinations became occupied', () => {
    const session = setup(state => { state.players[0]!.fields.unshift(planted('grain')) })
    start(session)
    session.state.players[0]!.fields[1]!.stacks = [{ kind: 'vegetable', remaining: 2 }]
    assertRejected(session, () => select(session, source))
  })

  it.each(['one-source', 'occupied-target', 'incompatible-target'] as const)('is unavailable for %s', scenario => {
    const session = setup(state => {
      const player = state.players[0]!
      player.fields = [planted('grain', scenario === 'one-source' ? 1 : 2)]
      if (scenario !== 'incompatible-target') player.fields.push({ ...target, stacks: scenario === 'occupied-target' ? [{ kind: 'vegetable', remaining: 2 }] : [] })
    })
    expect(session.getState().interaction.anytimeActions.map(action => action.id)).not.toContain(ANYTIME)
    assertRejected(session, () => session.takeAnytimeAction(0, ANYTIME))
  })

  it('rejects a newly occupied destination without losing the source', () => {
    const session = setup(state => { state.players[0]!.fields.unshift(planted('grain')) })
    start(session)
    expect(select(session, source).ok).toBe(true)
    session.state.players[0]!.fields[1]!.stacks = [{ kind: 'vegetable', remaining: 2 }]
    assertRejected(session, () => select(session, target))
  })

  it('restores pending and moves only once after undo', () => {
    const session = setup(state => { state.players[0]!.fields.unshift(planted('grain')) })
    start(session)
    expect(select(session, source).ok).toBe(true)
    expect(select(session, target).ok).toBe(true)
    expect(session.undoStep().ok).toBe(true)
    expect(positions(session.getState())).toEqual([target])
    expect(session.state.players[0]!.fields).toEqual([planted('grain'), { ...target, stacks: [] }])
    session.state.players[0]!.fields[0]!.stacks = [{ kind: 'wood', remaining: 2 }]
    assertRejected(session, () => select(session, target))
    session.state.players[0]!.fields[0]!.stacks = [{ kind: 'grain', remaining: 2 }]
    expect(select(session, target).ok).toBe(true)
    expect(session.state.players[0]!.fields.map(field => field.stacks)).toEqual([[{ kind: 'grain', remaining: 1 }], [{ kind: 'grain', remaining: 1 }]])
    expect(session.state.events?.filter(event => event.type === 'farm.cropRemoved')).toHaveLength(1)
    expect(session.state.events?.filter(event => event.type === 'farm.cropAdded')).toHaveLength(1)
    expect(session.state.players[0]!.cardStates[WOOD]?.extraData?.cardFieldStacks).toEqual([{ crop: 'wood', remaining: 2 }, null])
  })
})
