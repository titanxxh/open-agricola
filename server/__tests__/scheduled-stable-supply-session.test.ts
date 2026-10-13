import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

const SOURCE = 'A089_StablePlanner'
const DUE = 'scheduled-stables-2'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// The generic StartOfTurn scheduler keeps reserved pieces until completion.
// Two-player Session tests exercise scarce supply, partial construction, live
// payment and paused cursor restoration through public selection commands.
const prepare = (configure: (state: GameState) => void): GameSession => {
  const session = createWorkSession({
    seed: 56134,
    configure(state) {
      for (const player of state.players) {
        player.resources.food = 40
      }
      const owner = state.players[0]!
      owner.stableTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
      state.futureMeeples.push({ id: DUE, cardId: SOURCE, playerId: owner.id,
        round: 2, resources: { stable: 2 }, actionId: null })
      configure(state)
    },
  })
  sessions.push(session)
  return session
}

const choose = (session: GameSession, response: SessionResponse, value: string): SessionResponse => {
  if (response.interaction.stateId !== 'wait') throw new Error('Expected a preparation choice')
  const actor = response.interaction.request.kind === 'confirm-next-player'
    ? response.interaction.request.fromPlayerIndex : response.interaction.playerIndex
  const next = session.resolveChoice(actor, value)
  expect(next.ok, next.error).toBe(true)
  return next
}

const finishRoundOne = (session: GameSession): SessionResponse => {
  let response = session.getState()
  for (const [actor, space] of [[0, 'reed-bank'], [1, 'forest'], [0, 'clay-pit'], [1, 'day-laborer']] as const) {
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
      response = choose(session, response, 'confirm')
    }
    expect(response.interaction.stateId).toBe('idle')
    response = session.takeAction(actor, space)
    expect(response.ok, response.error).toBe(true)
  }
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
    response = choose(session, response, 'confirm')
  }
  expect(response.state.round).toBe(2)
  return response
}

const chooseStable = (session: GameSession, response: SessionResponse): SessionResponse => {
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select') return response
  if (response.interaction.stateId !== 'wait') throw new Error('Expected a scheduled stable source')
  expect(response.interaction.request.kind).toBe('select-trigger')
  const stable = response.interaction.request.options?.find(option => option.sourceCard === SOURCE && !option.disabled)
  expect(stable, JSON.stringify(response.interaction)).toBeDefined()
  const next = choose(session, response, stable!.value)
  expect(next.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } } })
  return next
}

const build = (session: GameSession, response: SessionResponse): SessionResponse => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select'
    || response.interaction.request.farm.farmType !== 'stable') throw new Error('Expected a stable farm selection')
  expect(response.interaction.request.farm.maxSelections).toBe(1)
  const next = session.commitSelectionChoice(response.interaction.playerIndex, {
    stables: [response.interaction.request.farm.selectableTiles[0]!],
  })
  expect(next.ok, next.error).toBe(true)
  return next
}

describe('mature scheduled stable reservations', () => {
  it('credits only the owner\'s current due reservation', () => {
    const session = prepare(state => {
      state.round = 6
      const owner = state.players[0]!
      state.futureMeeples = [
        { id: 'due', cardId: SOURCE, playerId: owner.id, round: 6, resources: { stable: 1 }, actionId: null },
        { id: 'later', cardId: SOURCE, playerId: owner.id, round: 7, resources: { stable: 1 }, actionId: null },
        { id: 'other', cardId: SOURCE, playerId: state.players[1]!.id, round: 6, resources: { stable: 1 }, actionId: null },
      ]
    })
    const owner = session.state.players[0]!
    expect(getAvailableStableSupplyCount(session.state, owner)).toBe(0)
    expect(getAvailableStableSupplyCount(session.state, owner, 'due')).toBe(1)
    for (const id of ['later', 'other', 'missing']) expect(getAvailableStableSupplyCount(session.state, owner, id)).toBe(0)
    expect(session.state.futureMeeples.map(entry => entry.resources.stable)).toEqual([1, 1, 1])
  })

  it('builds both reserved pieces and restores the remaining opportunity without double counting', () => {
    const session = prepare(() => {})
    let response = finishRoundOne(session)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(2)
    response = chooseStable(session, response)
    const beforeInvalid = structuredClone(response.state.futureMeeples)
    const invalid = session.commitSelectionChoice(0, { stables: [response.state.players[0]!.roomTiles[0]!] })
    expect(invalid.ok).toBe(false)
    expect(invalid.state.futureMeeples).toEqual(beforeInvalid)
    expect(invalid.state.players[0]!.stableTiles).toHaveLength(2)
    expect(invalid.state.players[0]!.resources.wood).toBe(0)
    response = build(session, invalid)
    expect(response.state.players[0]!.stableTiles).toHaveLength(3)
    expect(response.state.futureMeeples.find(entry => entry.id === DUE)?.resources.stable).toBe(1)
    expect(getAvailableStableSupplyCount(response.state, response.state.players[0]!)).toBe(0)

    const snapshot = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    sessions.push(restored)
    expect(restored.getState().interaction).toEqual(response.interaction)
    response = chooseStable(restored, restored.getState())
    response = build(restored, response)
    expect(response.state.players[0]!.stableTiles).toHaveLength(4)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.futureMeeples).toEqual([])
    expect(response.state.events.filter(event => event.type === 'farm.stableBuilt')).toHaveLength(2)
    expect(response.state.events.filter(event => event.type === 'futureMeeple.resolved' && event.cardId === SOURCE)).toHaveLength(1)
    expect(response.state.roundPhase).toBe('work')
  })

  it('keeps an unpaid due stable reserved until a live grain exchange funds its cost', () => {
    const session = prepare(state => {
      const owner = state.players[0]!
      owner.stableTiles.push({ row: 0, col: 2 })
      owner.resources.food = 0
      owner.resources.grain = 1
      const entry = state.futureMeeples[0]!
      entry.resources.stable = 1
      entry.actionContext = { exactCost: { food: 1, max: 1 } }
    })
    let response = finishRoundOne(session)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(3)
    expect(response.state.futureMeeples.find(entry => entry.id === DUE)?.resources.stable).toBe(1)
    if (response.interaction.stateId !== 'wait') throw new Error('Expected the live preparation window')
    expect(response.interaction.request.options?.some(option => option.sourceCard === SOURCE && !option.disabled)).toBe(false)
    const exchange = response.interaction.request.options?.find(option => option.labelKey === 'actions.exchange.name')
    expect(exchange, JSON.stringify(response.interaction)).toBeDefined()
    response = choose(session, response, exchange!.value)
    if (response.interaction.stateId !== 'wait') throw new Error('Expected a grain conversion')
    const grain = response.interaction.request.options?.find(option => option.effectPreview?.kind === 'resourceExchange'
      && option.effectPreview.resourcesPaid?.grain === 1 && option.effectPreview.resourcesGained?.food === 1)
    expect(grain, JSON.stringify(response.interaction)).toBeDefined()
    response = choose(session, response, grain!.value)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, grain: 0 })
    expect(response.state.futureMeeples.find(entry => entry.id === DUE)?.resources.stable).toBe(1)
    response = chooseStable(session, response)
    response = build(session, response)
    expect(response.state.players[0]!.stableTiles).toHaveLength(4)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 0, wood: 0 })
    expect(response.state.futureMeeples).toEqual([])
    expect(response.state.events.filter(event => event.type === 'resource.exchanged' && event.paid.grain === 1)).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'farm.stableBuilt')).toHaveLength(1)
    expect(response.state.roundPhase).toBe('work')
  })

  it('undoes one constructed piece together with its reservation before retrying', () => {
    const session = prepare(() => {})
    let response = build(session, chooseStable(session, finishRoundOne(session)))
    expect(response.state.players[0]!.stableTiles).toHaveLength(3)
    expect(response.state.futureMeeples.find(entry => entry.id === DUE)?.resources.stable).toBe(1)
    response = session.undoStep(0)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(2)
    expect(response.state.futureMeeples.find(entry => entry.id === DUE)?.resources.stable).toBe(2)
    expect(response.state.events.filter(event => event.type === 'farm.stableBuilt')).toHaveLength(0)
    response = build(session, chooseStable(session, response))
    expect(response.state.players[0]!.stableTiles).toHaveLength(3)
    expect(response.state.futureMeeples.find(entry => entry.id === DUE)?.resources.stable).toBe(1)
    response = build(session, chooseStable(session, response))
    expect(response.state.players[0]!.stableTiles).toHaveLength(4)
    expect(response.state.futureMeeples).toEqual([])
    expect(response.state.events.filter(event => event.type === 'farm.stableBuilt')).toHaveLength(2)
  })
})
