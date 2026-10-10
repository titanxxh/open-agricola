import { afterEach, describe, expect, it } from 'vitest'
import { clearCustomCards } from '../../shared/cards/custom-registry'
import type { GameState } from '../../shared/contract/types'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { GameSession } from '../game/authoritative-session'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { COUNT_LEAF_SOURCE, compileContractCard, createRoundTenSession } from './_helpers/workshop-contract-card'

/**
 * ADR 0025 fixed behavior tests for the listener actions gain, plow, sow,
 * bake-bread, fence, stables, family-growth, wish-children, receive and reap,
 * and for the opponent listener scope. One custom card listens to
 * each of them in the before, immediatelyAfter and after phases and counts
 * every call on its own card state. Each scenario is a two-player work phase
 * in round 10; player 0 has played the card and takes one action.
 */

const CARD_ID = 'CUSTOM_FarmProbe'
const ACTIONS = ['gain', 'receive', 'plow', 'sow', 'fence', 'stables', 'wish-children', 'family-growth', 'bake-bread', 'reap']
const PHASES = ['before', 'immediatelyAfter', 'after']
const ONE_CELL_FENCES = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const sessions: GameSession[] = []
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose()
  clearCustomCards()
})

const start = (configure?: (state: GameState) => void, workers: [number, number] = [2, 0]) => {
  const card = compileContractCard(CARD_ID, `${COUNT_LEAF_SOURCE}
const CARD_IMPL = { listeners: [
${ACTIONS.flatMap(action => PHASES.map(phase => `  { cardIds: [CARD_ID], actions: ['${action}'], phases: ['${phase}'],
    handler: () => ({ sourceCard: CARD_ID, flow: count('${phase}:${action}') }) },`)).join('\n')}
] }`)
  const session = createRoundTenSession(card, { workers, configure })
  sessions.push(session)
  return session
}

const counters = (session: GameSession, playerIndex = 0) =>
  session.getState().state.players[playerIndex]!.cardStates[CARD_ID]?.counters

const reactions = (action: string) => ({
  [`before:${action}`]: 1, [`immediatelyAfter:${action}`]: 1, [`after:${action}`]: 1,
})

describe('Workshop Capability Contract farm and round listeners', () => {
  it('reacts to gain', () => {
    const session = start()

    const gained = session.takeAction(0, 'day-laborer')

    expect(gained.ok).toBe(true)
    expect(gained.state.players[0]!.resources.food).toBe(12)
    expect(counters(session)).toEqual(reactions('gain'))
    expect(session.cardWarnings).toEqual([])
  })

  it('reacts to plow before the tile is chosen and after the field is placed', () => {
    const session = start()

    const pending = session.takeAction(0, 'farmland')

    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } } })
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'farm-select') return
    expect(counters(session)).toEqual({ 'before:plow': 1 })

    const plowed = session.commitSelectionChoice(0, { tile: pending.interaction.request.farm.selectableTiles[0] })

    expect(plowed.ok).toBe(true)
    expect(plowed.state.players[0]!.fields).toHaveLength(1)
    expect(counters(session)).toEqual(reactions('plow'))
    expect(session.cardWarnings).toEqual([])
  })

  it('does not react to the opponent\'s plow', () => {
    const session = start((state) => { state.currentPlayerIndex = 1 }, [0, 2])

    const pending = session.takeAction(1, 'farmland')
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'farm-select') throw new Error('expected a plow selection')
    const plowed = session.commitSelectionChoice(1, { tile: pending.interaction.request.farm.selectableTiles[0] })

    expect(plowed.state.players[1]!.fields).toHaveLength(1)
    expect(counters(session, 0)).toBeUndefined()
    expect(counters(session, 1)).toBeUndefined()
  })

  it('reacts to sow', () => {
    const session = start((state) => {
      state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }]
      state.players[0]!.resources.grain = 1
    })

    const offered = session.takeAction(0, 'grain-utilization')
    if (offered.interaction.stateId !== 'wait' || offered.interaction.request.kind !== 'choice') throw new Error('expected the sow or bake choice')
    const sow = offered.interaction.request.options!.find(option => option.labelKey === 'actions.sow.name')!
    session.resolveChoice(0, sow.value)
    expect(counters(session)).toEqual({ 'before:sow': 1 })

    const sown = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] })

    expect(sown.ok).toBe(true)
    expect(sown.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(counters(session)).toEqual(reactions('sow'))
    expect(session.cardWarnings).toEqual([])
  })

  it('reacts to bake-bread', () => {
    const session = start((state) => {
      state.players[0]!.improvements = ['Major_Fireplace1']
      state.players[0]!.resources.grain = 1
    })

    const offered = session.takeAction(0, 'grain-utilization')
    if (offered.interaction.stateId !== 'wait' || offered.interaction.request.kind !== 'choice') throw new Error('expected the sow or bake choice')
    const bake = offered.interaction.request.options!.find(option => option.labelKey === 'actions.bake-bread.name')!
    // One grain and one Fireplace leave nothing to choose inside the bake.
    const baked = session.resolveChoice(0, bake.value)

    expect(baked.ok).toBe(true)
    expect(baked.state.players[0]!.resources).toMatchObject({ grain: 0, food: 12 })
    expect(counters(session)).toEqual(reactions('bake-bread'))
    expect(session.cardWarnings).toEqual([])
  })

  it('reacts to fence', () => {
    const session = start((state) => { state.players[0]!.resources.wood = 4 })

    const pending = session.takeAction(0, 'fencing')

    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } } })
    expect(counters(session)).toEqual({ 'before:fence': 1 })

    const fenced = session.commitSelectionChoice(0, { edges: ONE_CELL_FENCES, palisadeEdges: [], extraWood: 0 })

    expect(fenced.ok).toBe(true)
    expect(fenced.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(fenced.state.players[0]!.resources.wood).toBe(0)
    expect(counters(session)).toEqual(reactions('fence'))
    expect(session.cardWarnings).toEqual([])
  })

  it('reacts to stables', () => {
    const session = start((state) => { state.players[0]!.resources.wood = 2 })

    // Without the goods for a room, Farm Expansion goes straight to the stable.
    const pending = session.takeAction(0, 'farm-expansion')

    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } } })
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'farm-select') return
    expect(counters(session)).toEqual({ 'before:stables': 1 })

    const built = session.commitSelectionChoice(0, { stables: [pending.interaction.request.farm.selectableTiles[0]!] })

    expect(built.ok).toBe(true)
    expect(built.state.players[0]!.stableTiles).toHaveLength(1)
    expect(counters(session)).toEqual(reactions('stables'))
    expect(session.cardWarnings).toEqual([])
  })

  it('reacts to family-growth, and to wish-children before that action space is used', () => {
    const session = start((state) => { state.players[0]!.rooms = 3 })

    const grown = session.takeAction(0, 'wish-children')

    expect(grown.ok).toBe(true)
    expect(grown.state.players[0]!.workers.filter(worker => worker.isActive)).toHaveLength(3)
    // wish-children is the action space; only its before phase is dispatched to listeners.
    expect(counters(session)).toEqual({ 'before:wish-children': 1, ...reactions('family-growth') })
    expect(session.cardWarnings).toEqual([])
  })

  it('reacts to receive when goods scheduled on the next round space arrive', () => {
    const session = start((state) => {
      state.futureMeeples.push({
        id: 'contract-probe-receive', cardId: CARD_ID, playerId: state.players[0]!.id, round: 11, actionId: null, resources: { food: 1 },
      })
      state.players.forEach(player => markAllWorkersUsed(state, player))
    })

    autoAdvanceRoundEnd(session, { maxIterations: 200 })

    const state = session.getState().state
    expect(state.round).toBe(11)
    expect(state.players[0]!.resources.food).toBe(11)
    expect(counters(session)).toEqual(reactions('receive'))
    expect(session.cardWarnings).toEqual([])
  })

  it('reacts to reap once for the crop taken from a field at Harvest', () => {
    const session = start((state) => {
      // Round 4 ends with the first Harvest.
      state.round = 4
      state.players[0]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] }]
      state.players.forEach(player => markAllWorkersUsed(state, player))
    })

    autoAdvanceRoundEnd(session, { maxIterations: 200 })

    const state = session.getState().state
    expect(state.round).toBe(5)
    expect(state.players[0]!.resources.grain).toBe(1)
    expect(state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 1 }])
    // Reaping is dispatched as a single immediatelyAfter call per crop.
    expect(counters(session)).toEqual({ 'immediatelyAfter:reap': 1 })
    expect(session.cardWarnings).toEqual([])
  })

  it('with the opponent scope, reacts to the opponent\'s action and not to the owner\'s', () => {
    const card = compileContractCard(CARD_ID, `${COUNT_LEAF_SOURCE}
const CARD_IMPL = { listeners: [{ cardIds: [CARD_ID], actions: ['plow'], phases: ['after'], scope: 'opponent',
  handler: () => ({ sourceCard: CARD_ID, flow: count('opponent-plowed') }) }] }`)
    const session = createRoundTenSession(card, { workers: [2, 2] })
    sessions.push(session)
    const plow = (playerIndex: number, space: string) => {
      const pending = session.takeAction(playerIndex, space)
      if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'farm-select') throw new Error(`expected a plow selection: ${pending.error}`)
      return session.commitSelectionChoice(playerIndex, { tile: pending.interaction.request.farm.selectableTiles[0] })
    }

    expect(plow(0, 'farmland').state.players[0]!.fields).toHaveLength(1)
    expect(counters(session)).toBeUndefined()

    confirmNextPlayer(session)
    // Farmland is taken; Cultivation is the other space that plows.
    expect(plow(1, 'cultivation').state.players[1]!.fields).toHaveLength(1)

    // The flow belongs to the card owner, whose card state records it.
    expect(counters(session, 0)).toEqual({ 'opponent-plowed': 1 })
    expect(counters(session, 1)).toBeUndefined()
    expect(session.cardWarnings).toEqual([])
  })
})
