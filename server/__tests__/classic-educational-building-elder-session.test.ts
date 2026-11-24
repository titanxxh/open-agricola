import { afterEach, describe, expect, it } from 'vitest'
import { computeAllowedPlacementSpaces } from '../../shared/actions/helpers/placement-availability'
import type { GameState } from '../../shared/contract/types'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmTurns } from './_helpers/classic-fl'
import { choose, playImprovement, playOccupation, restoreSession } from './_helpers/card-play-lifecycle'
import { expectWait, resolveNonSkipChoice, resolveSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'

const SCHOOL = 'CFL004_EducationalBuilding'
const ELDER = 'CFL032_Elder'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const game = (configure: (state: GameState) => void) => {
  const session = createWorkSession({ seed: 4032, configure })
  sessions.push(session)
  return session
}

const schoolSession = (family: number, available: number) => game(state => {
  state.round = 11
  const owner = state.players[0]!
  owner.minorPlayed = [SCHOOL]
  setActiveWorkerCount(owner, family)
  setWorkersAtHome(state, owner, available)
})

describe('Educational Building', () => {
  it.each([3, 4])('schedules wood, stone, wood on the first placement of family member %i', family => {
    const session = schoolSession(family, 1)
    const result = session.takeAction(0, SCHOOL)
    expect(result.ok, result.error).toBe(true)
    expect(result.state.futureMeeples.filter(entry => entry.cardId === SCHOOL).map(entry =>
      [entry.playerId, entry.round, entry.resources])).toEqual([
      [result.state.players[0]!.id, 12, { wood: 1 }],
      [result.state.players[0]!.id, 13, { stone: 1 }],
      [result.state.players[0]!.id, 14, { wood: 1 }],
    ])
    expect(result.state.events).toContainEqual(expect.objectContaining({ type: 'futureMeeple.queued', cardId: SCHOOL }))
    expect(result.state.actionSpaces.find(space => space.id === SCHOOL)?.takenBy[0]?.workerId)
      .toBe(result.state.players[0]!.workers[family - 1]!.id)
  })

  it.each([1, 2, 5])('does not admit family member %i', rank => {
    const session = schoolSession(Math.max(rank, 2), rank === 1 ? 2 : 1)
    expect(session.takeAction(0, SCHOOL)).toMatchObject({ ok: false })
    expect(session.state.futureMeeples).toHaveLength(0)
  })

  it('keeps the fifth token ineligible when an earlier family token is out of supply', () => {
    const session = game(state => {
      const owner = state.players[0]!
      owner.minorPlayed = [SCHOOL]
      setActiveWorkerCount(owner, 5)
      owner.workers[2]!.isActive = false
      owner.workers[2]!.removedFromSupply = true
      setWorkersAtHome(state, owner, 1)
    })
    expect(session.takeAction(0, SCHOOL)).toMatchObject({ ok: false })
    expect(session.takeAction(0, 'day-laborer').ok).toBe(true)
  })

  it('excludes the space from workerless use, relocation and guest targets', () => {
    const session = schoolSession(3, 1)
    const allowed = (newPlacement: boolean, actionContext?: Record<string, unknown>) => session.withCtx(() =>
      computeAllowedPlacementSpaces(session.state, session.state.players[0]!, {
        actionHooks: session.actionHooks, actionSpaceUse: { newPlacement }, actionContext, ignoreWorkerAvailability: true,
      }).map(entry => entry.spaceId))
    expect(allowed(true)).toContain(SCHOOL)
    expect(allowed(false)).not.toContain(SCHOOL)
    expect(allowed(true, { workerSource: { kind: 'guest', guestId: 'guest-1' } })).not.toContain(SCHOOL)
    expect(allowed(true, { workerSource: { kind: 'supply', disposition: 'return-to-supply' } })).not.toContain(SCHOOL)
  })

  it('rejects an opponent even on their third person’s first turn', () => {
    const session = game(state => {
      state.players[0]!.minorPlayed = [SCHOOL]
      state.currentPlayerIndex = 1
      setActiveWorkerCount(state.players[1]!, 3)
      setWorkersAtHome(state, state.players[1]!, 1)
    })
    expect(session.takeAction(1, SCHOOL)).toMatchObject({ ok: false })
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
  })

  it('on purchase counts a third person who already worked while the building was still in the deck', () => {
    const previous = game(state => {
      state.round = 11
      setActiveWorkerCount(state.players[0]!, 3)
      setWorkersAtHome(state, state.players[0]!, 1)
    })
    const used = previous.takeAction(0, 'day-laborer')
    expect(used.ok).toBe(true)
    const session = game(state => {
      state.round = 12
      state.events = [...used.state.events]
      state.nextEventSeq = used.state.nextEventSeq
      const owner = state.players[0]!
      owner.minorHand = [SCHOOL]
      owner.resources.clay = 2
      owner.resources.reed = 1
      setActiveWorkerCount(owner, 3)
      setWorkersAtHome(state, owner, 2)
      markAllWorkersUsed(state, state.players[1]!)
    })
    const purchased = playImprovement(session, SCHOOL, 'meeting-place')
    expect(purchased.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
    expect(purchased.state.actionSpaces.filter(space => space.id === SCHOOL)).toHaveLength(1)
    expect(purchased.state.players[0]!.cardStates[SCHOOL]?.extraData?.['worked-3']).toBe(true)
    const restored = restoreSession(session)
    sessions.push(restored)
    const nextTurn = confirmTurns(restored, restored.getState())
    expect(nextTurn.state.currentPlayerIndex).toBe(0)
    expect(restored.takeAction(0, SCHOOL)).toMatchObject({ ok: false })
    expect(restored.takeAction(0, 'day-laborer').ok).toBe(true)
  })
})

const elderSession = (round: number, foodOnCard = 2, resourcesOnFishing = 3, oven = true) => game(state => {
  state.round = round
  for (const player of state.players) player.resources.food = 12
  const owner = state.players[0]!
  owner.occupationPlayed = [ELDER]
  owner.cardStates[ELDER] = { counters: { food: foodOnCard } }
  owner.resources.grain = 1
  if (oven) owner.improvements = ['Major_ClayOven']
  const fishing = state.actionSpaces.find(space => space.id === 'fishing')!
  fishing.resources.food = resourcesOnFishing
  fishing.takenBy.push({ playerId: state.players[1]!.id, workerId: state.players[1]!.workers[0]!.id })
  for (const player of state.players) markAllWorkersUsed(state, player)
})
const stored = (response: SessionResponse) => response.state.players[0]!.cardStates[ELDER]?.counters?.food

const chooseElderAction = (session: GameSession, response: SessionResponse, action: 'fishing' | 'bake-bread') => {
  const options = expectWait(response).interaction.request.options!
  expect(options.map(option => option.labelKey)).toEqual(expect.arrayContaining(['actions.fishing.name', 'actions.bake-bread.name']))
  return choose(session, response, options.find(option => option.labelKey === `actions.${action}.name`)!.value)
}

describe('Elder', () => {
  it.each([2, 4])('after people return in round %i, can fish without placing anyone', round => {
    const session = elderSession(round)
    const offered = session.performRoundEnd()
    expect(offered.state.roundPhase).toBe('returning-home')
    expect(offered.state.actionSpaces.find(space => space.id === 'fishing')!.takenBy).toEqual([])
    expect(offered.state.events.some(event => event.round === round && event.type === 'harvest.started')).toBe(false)
    const menu = resolveTriggerIfPresent(session, offered, ELDER)
    const result = chooseElderAction(session, menu, 'fishing')
    expect(stored(result)).toBe(1)
    expect(result.state.events).toContainEqual(expect.objectContaining({
      type: 'actionSpace.useStarted', spaceId: 'fishing', newPlacement: false, round,
    }))
    expect(result.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved', resources: { food: 3 }, from: { kind: 'actionSpace', spaceId: 'fishing' },
    }))
  })

  it('can choose the bake recipe instead; only the card pays the fee', () => {
    const session = elderSession(2)
    const menu = resolveTriggerIfPresent(session, session.performRoundEnd(), ELDER)
    let result = chooseElderAction(session, menu, 'bake-bread')
    if (result.interaction.stateId === 'wait' && result.interaction.request.options?.some(o => o.value === 'Major_ClayOven'))
      result = choose(session, result, 'Major_ClayOven')
    expect(result.state.players[0]!.resources).toMatchObject({ food: 17, grain: 0 })
    expect(stored(result)).toBe(1)
    expect(result.state.events.some(event => event.type === 'actionSpace.useStarted' && event.spaceId === 'fishing')).toBe(false)
  })

  it('offers baking when Potter Ceramics can provide grain before the bake', () => {
    const session = game(state => {
      state.round = 2
      const owner = state.players[0]!
      owner.occupationPlayed = [ELDER]
      owner.cardStates[ELDER] = { counters: { food: 2 } }
      owner.minorPlayed = ['D066_PotterCeramics']
      owner.improvements = ['Major_ClayOven']
      owner.resources.grain = 0
      owner.resources.clay = 1
      state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 2
      for (const player of state.players) markAllWorkersUsed(state, player)
    })
    const menu = resolveTriggerIfPresent(session, session.performRoundEnd(), ELDER)
    const chosen = chooseElderAction(session, menu, 'bake-bread')
    const bake = resolveNonSkipChoice(session, resolveTriggerIfPresent(session, chosen, 'D066_PotterCeramics'))
    expect(bake.state.players[0]!.resources).toMatchObject({ clay: 0, grain: 0 })
    expect(bake.state.events).toContainEqual(expect.objectContaining({ type: 'resource.exchanged', paid: { grain: 1 }, gained: { food: 5 } }))
    expect(stored(bake)).toBe(1)
  })

  it('can pass and keep the food on the card', () => {
    const session = elderSession(2)
    const result = resolveSkipChoice(session, session.performRoundEnd())
    expect(stored(result)).toBe(2)
    expect(result.state.players[0]!.resources).toMatchObject({ food: 12, grain: 1 })
  })

  it.each([[0, 3], [2, 0]])('skips the window with %i food on the card and %i in Fishing when unable to bake', (stock, fishing) => {
    const session = elderSession(2, stock, fishing, false)
    const result = session.performRoundEnd()
    expect(result.state.round).toBe(3)
    expect(stored(result)).toBe(stock)
    expect(result.state.events.some(event => event.type === 'card.triggered' && event.sourceCardId === ELDER)).toBe(false)
  })

  it('puts two food on the card when played and lets the owner withdraw stock during a work turn', () => {
    const session = game(state => {
      state.players[0]!.occupationHand = [ELDER]
      state.players[0]!.resources.food = 9
    })
    const bought = playOccupation(session, ELDER)
    expect(stored(bought)).toBe(2)
    const next = game(state => {
      state.players[0]!.occupationPlayed = [ELDER]
      state.players[0]!.cardStates[ELDER] = bought.state.players[0]!.cardStates[ELDER]!
      state.players[0]!.resources.food = 9
    })
    const offer = next.takeAnytimeAction(0, ELDER + '-withdraw-food')
    const result = resolveNonSkipChoice(next, offer)
    expect(stored(result)).toBe(1)
    expect(result.state.players[0]!.resources.food).toBe(10)
    expect(result.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved', sourceCardId: ELDER, resources: { food: 1 }, from: { kind: 'card', playerId: result.state.players[0]!.id, cardId: ELDER },
    }))
  })
})
