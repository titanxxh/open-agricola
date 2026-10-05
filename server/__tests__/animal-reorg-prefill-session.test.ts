import { describe, expect, it } from 'vitest'
import type { SessionResponse } from '../../shared/session/session-core'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

/**
 * Approved prototype contract: this is a reusable animal mechanism, not a card
 * implementation. Session coverage is required because gain, pending, confirm,
 * storage, events and discard settlement cross the authoritative boundary.
 *
 * Each case starts a seeded new two-player work-phase game, fixes both hands,
 * gives both players 20 food, leaves action spaces unoccupied, and explicitly
 * prepares farm/card storage. Drive takeAction/devSetResources -> inspect draft
 * without placement mutation -> resolveChoice(confirm, draft) -> assert board,
 * inventory, events/log, scores and continuation. Card limits use existing
 * effects; no new card-specific branches. No old animals may move on prefill.
 */
const setup = () => {
  const session = new GameSession(960, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.round = 5
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  for (const p of state.players) {
    p.resources.food = 20
    setWorkersAtHome(state, p, 2)
  }
  const player = state.players[0]!
  Object.assign(player.resources, { sheep: 0, boar: 0, cattle: 1 })
  player.houseAnimalType = 'cattle'
  player.houseAnimalCount = 1
  player.pastures = [{ id: 'p', size: 2, tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], stables: 0, animalType: null, animalCount: 0 }]
  session.loadState(state)
  return session
}

const zones = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected animal reorganization')
  }
  return response.interaction.request.zones
}

describe('Animal Reorg Prefill', () => {
  it('prefills harvest newborns and resumes harvest after confirming that draft', () => {
    const session = setup()
    const state = session.getState().state
    state.round = 4
    for (const player of state.players) markAllWorkersUsed(state, player)
    state.players[0]!.resources.sheep = 2
    Object.assign(state.players[0]!.pastures[0]!, { animalType: 'sheep', animalCount: 2 })
    session.loadState(state)
    const pending = session.performRoundEnd()
    const draft = zones(pending)
    expect(draft.find((z) => z.id === 'p')).toMatchObject({ animalType: 'sheep', animalCount: 3 })
    expect(pending.state.players[0]!.pastures[0]!.animalCount).toBe(2)
    expect(pending.state.harvestBreedSummary?.[state.players[0]!.id]).toMatchObject({ animalCount: 1 })
    const confirmed = session.resolveChoice(0, 'confirm', draft)
    expect(confirmed.ok, confirmed.error).toBe(true)
    expect(confirmed.state.players[0]!.pastures[0]!.animalCount).toBe(3)
    expect(confirmed.state.round).toBe(5)
    expect(confirmed.interaction.stateId).toBe('idle')
    expect(confirmed.state.harvestBreedSummary).toBeUndefined()
  })

  it('prefills displaced card animals after capacity disappears without losing inventory', () => {
    const session = setup()
    const state = session.getState().state
    const p = state.players[0]!
    p.occupationPlayed = ['C086_LivestockFeeder']
    Object.assign(p.resources, { grain: 2, sheep: 2 })
    p.cardStates.C086_LivestockFeeder = { extraData: { animalCounts: { sheep: 2 } } }
    session.loadState(state)
    const pending = session.devSetResources(0, { grain: 0, sheep: 3 })
    const draft = zones(pending)
    expect(draft.find((z) => z.id === 'p')).toMatchObject({ animalType: 'sheep', animalCount: 3 })
    expect(draft.some((z) => z.cardId === 'C086_LivestockFeeder')).toBe(false)
    expect(pending.state.players[0]!.resources.sheep).toBe(3)
    expect(pending.state.players[0]!.pastures[0]!.animalCount).toBe(0)
    const confirmed = session.resolveChoice(0, 'confirm', draft)
    expect(confirmed.ok, confirmed.error).toBe(true)
    expect(confirmed.state.players[0]!.pastures[0]!.animalCount).toBe(3)
    expect(confirmed.state.players[0]!.resources.sheep).toBe(3)
    expect(confirmed.state.log.some((entry) => entry.key === 'log.reorganizeDiscard')).toBe(false)
  })

  it('tops up the existing sheep pasture and confirms the untouched draft', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.resources.sheep = 2
    Object.assign(state.players[0]!.pastures[0]!, { animalType: 'sheep', animalCount: 2 })
    state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 2
    session.loadState(state)

    const pending = session.takeAction(0, 'sheep-market')
    const draft = zones(pending)
    expect(draft.find((z) => z.id === 'p')).toMatchObject({ animalType: 'sheep', animalCount: 4 })
    expect(pending.state.players[0]!.pastures[0]!.animalCount).toBe(2)
    expect(pending.state.players[0]!.resources.sheep).toBe(4)
    expect(pending.state.events.some((event) => event.type === 'farm.animalMoved')).toBe(false)
    expect(session.getState().scores).toEqual(pending.scores)
    expect(zones(session.getState())).toEqual(draft)

    const confirmed = session.resolveChoice(0, 'confirm', draft)
    expect(confirmed.ok, confirmed.error).toBe(true)
    expect(confirmed.state.players[0]!.pastures[0]!).toMatchObject({ animalType: 'sheep', animalCount: 4 })
    expect(confirmed.state.players[0]!).toMatchObject({ houseAnimalType: 'cattle', houseAnimalCount: 1 })
    expect(confirmed.state.log.some((entry) => entry.key === 'log.reorganizeDiscard')).toBe(false)
    expect(confirmed.interaction.stateId === 'wait' && confirmed.interaction.request.kind).toBe('confirm-next-player')
  })

  it('reserves the sheep-only card for sheep so the empty pasture can hold pigs', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.pastures[0]!.size = 1
    state.players[0]!.minorPlayed = ['E084_DollysMother']
    session.loadState(state)
    const pending = session.devSetResources(0, { sheep: 1, boar: 2 })
    const draft = zones(pending)
    expect(draft.find((z) => z.id === 'p')).toMatchObject({ animalType: 'boar', animalCount: 2 })
    expect(draft.find((z) => z.cardId === 'E084_DollysMother')).toMatchObject({ animalType: 'sheep', animalCount: 1 })
    expect(pending.state.players[0]!.cardStates.E084_DollysMother?.extraData?.animalCounts).toBeUndefined()
    const confirmed = session.resolveChoice(0, 'confirm', draft)
    expect(confirmed.ok, confirmed.error).toBe(true)
    expect(confirmed.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 2, cattle: 1 })
  })

  it('keeps an existing sheep in place even when moving it could fit more pigs', () => {
    const session = setup()
    const state = session.getState().state
    const p = state.players[0]!
    p.houseAnimalType = null
    p.houseAnimalCount = 0
    Object.assign(p.resources, { sheep: 1, cattle: 0 })
    Object.assign(p.pastures[0]!, { animalType: 'sheep', animalCount: 1 })
    session.loadState(state)
    const pending = session.devSetResources(0, { boar: 2 })
    const draft = zones(pending)
    expect(draft.find((z) => z.id === 'p')).toMatchObject({ animalType: 'sheep', animalCount: 1 })
    expect(draft.find((z) => z.id === 'house')).toMatchObject({ animalType: 'boar', animalCount: 1 })
    expect(pending.state.players[0]!.resources.boar).toBe(2)
    // The player can still explicitly replace the proposed layout.
    const confirmed = session.resolveChoice(0, 'confirm', [
      { id: 'p', zoneType: 'pasture', animalType: 'boar', animalCount: 2 },
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ])
    expect(confirmed.ok, confirmed.error).toBe(true)
    expect(confirmed.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 2 })
  })

  it('maximizes partial placement and only discards the rest after confirmation', () => {
    const session = setup()
    const pending = session.devSetResources(0, { sheep: 4, boar: 2 })
    const draft = zones(pending)
    expect(draft.find((z) => z.id === 'p')).toMatchObject({ animalType: 'sheep', animalCount: 4 })
    expect(pending.state.players[0]!.resources.boar).toBe(2)
    expect(pending.state.log.some((entry) => entry.key === 'log.reorganizeDiscard')).toBe(false)
    const rejected = session.resolveChoice(0, 'confirm', [{ id: 'p', zoneType: 'pasture', animalType: 'sheep', animalCount: 5 }])
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(pending.state)
    expect(rejected.interaction).toEqual(pending.interaction)
    const confirmed = session.resolveChoice(0, 'confirm', draft)
    expect(confirmed.ok, confirmed.error).toBe(true)
    expect(confirmed.state.players[0]!.resources).toMatchObject({ sheep: 4, boar: 0, cattle: 1 })
    expect(confirmed.state.log.find((entry) => entry.key === 'log.reorganizeDiscard')?.params?.resources).toEqual({ boar: 2 })
  })

  it('fills a mixed card within its per-species limits without changing old farm animals', () => {
    const session = setup()
    const state = session.getState().state
    const p = state.players[0]!
    p.resources.sheep = 4
    Object.assign(p.pastures[0]!, { animalType: 'sheep', animalCount: 4 })
    p.minorPlayed = ['C011_WildlifeReserve']
    p.cardStates.C011_WildlifeReserve = { extraData: {} }
    session.loadState(state)
    const pending = session.devSetResources(0, { sheep: 5, boar: 2, cattle: 2 })
    const draft = zones(pending)
    expect(draft.find((z) => z.cardId === 'C011_WildlifeReserve')?.animalCounts).toEqual({ sheep: 1, boar: 1, cattle: 1 })
    expect(draft.find((z) => z.id === 'p')).toMatchObject({ animalType: 'sheep', animalCount: 4 })
    expect(pending.state.players[0]!.cardStates.C011_WildlifeReserve.extraData?.animalCounts).toBeUndefined()
    const confirmed = session.resolveChoice(0, 'confirm', draft)
    expect(confirmed.ok, confirmed.error).toBe(true)
    expect(confirmed.state.players[0]!.cardStates.C011_WildlifeReserve.extraData?.animalCounts).toEqual({ sheep: 1, boar: 1, cattle: 1 })
    expect(confirmed.state.players[0]!.resources.boar).toBe(1)
  })
})
