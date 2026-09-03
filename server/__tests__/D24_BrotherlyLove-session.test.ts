import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import { getRoundPersonPlacementOrder, recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import type { ActionFlow } from '../../shared/contract/types'
import { setActiveWorkerCount, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { addWorkerRef, removeWorkerRef } from '../../shared/domain/space'
import { appendImmediateEvents } from '../../shared/events/append'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A025_Bassinet'
import '../../shared/cards/C/C037_DwellingMound'
import '../../shared/cards/C/C158_ForestCampaigner'
import '../../shared/cards/D/D024_BrotherlyLove'
import '../../shared/cards/D/D103_CanalBoatman'

const CARD_ID = 'D024_BrotherlyLove'

const playMinor = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'meeting-place')
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const setup = (options: { familySize?: number; placements?: number; withCard?: boolean } = {}) => {
  const session = new GameSession(42, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.phase = 'playing'
  state.round = 14
  state.roundPhase = 'work'
  for (const space of state.actionSpaces) space.takenBy = []

  const player = state.players[0]!
  setActiveWorkerCount(player, options.familySize ?? 4)
  player.rooms = 5
  if (options.withCard ?? true) player.minorPlayed.push(CARD_ID)
  player.resources.food = 0

  const placements = [['forest', '1'], ['clay-pit', '2']] as const
  for (const [spaceId, workerId] of placements.slice(0, options.placements ?? 2)) {
    state.actionSpaces.find((space) => space.id === spaceId)!.takenBy = [{ playerId: player.id, workerId }]
    recordRoundPlacement(player, spaceId, workerId)
  }
  state.actionSpaces.find((space) => space.id === 'reed-bank')!.takenBy = [
    { playerId: state.players[1]!.id, workerId: '1' },
  ]

  session.loadState(state)
  return session
}

const choicesOf = (response: SessionResponse) =>
  response.interaction.stateId === 'wait'
    ? response.interaction.request.options?.map((option) => option.value) ?? []
    : []

const acceptOptional = (session: GameSession, response: SessionResponse) => {
  const choice = choicesOf(response).find((value) => value !== '__skip__')
  expect(choice).toBeDefined()
  return session.resolveChoice(0, choice!)
}

describe('D024 Brotherly Love session', () => {
  it('D024 S1: Brotherly Love costs one food and stays in play', () => {
    const session = new GameSession(24, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 3
    state.roundPhase = 'work'
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorHand = [CARD_ID]
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 1
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)

    const response = playMinor(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('D024 S2: after the third placement exposes only the third occupied space for the fourth person', () => {
    const session = setup()
    const before = session.getState().state
    const eventCount = before.events.length
    const logCount = before.log.length

    let response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(choicesOf(response)).toContain('__skip__')

    response = acceptOptional(session, response)
    expect(choicesOf(response)).toContain('grain-seeds')
    expect(choicesOf(response)).toContain('allow-occupied:day-laborer')
    expect(choicesOf(response)).not.toContain('allow-occupied:forest')
    expect(choicesOf(response)).not.toContain('allow-occupied:clay-pit')
    expect(choicesOf(response)).not.toContain('allow-occupied:reed-bank')

    const foodBeforeFourth = response.state.players[0]!.resources.food
    response = session.resolveChoice(0, 'allow-occupied:day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(foodBeforeFourth + 2)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
    expect(getRoundPersonPlacementOrder(response.state.players[0]!)).toEqual([
      'forest',
      'clay-pit',
      'day-laborer',
      'day-laborer',
    ])
    expect(response.state.events.slice(eventCount).filter((event) => event.type === 'worker.placed'))
      .toEqual([
        expect.objectContaining({ spaceId: 'day-laborer' }),
        expect.objectContaining({ spaceId: 'day-laborer', viaCardId: CARD_ID }),
      ])
    expect(response.state.log.slice(0, response.state.log.length - logCount)
      .filter((entry) => entry.key === 'log.placeFarmer')).toHaveLength(2)
  })

  it('D024 S3: the optional immediate fourth placement can be declined', () => {
    const session = setup()

    let response = session.takeAction(0, 'day-laborer')
    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request).toEqual({ kind: 'confirm-next-player', nextPlayerIndex: 1 })

    response = session.resolveChoice(1, 'confirm')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.currentPlayerIndex).toBe(1)
    expect(getRoundPersonPlacementOrder(response.state.players[0]!)).toEqual([
      'forest',
      'clay-pit',
      'day-laborer',
    ])
  })

  it('D024 S4: a three-person family gets no immediate fourth placement', () => {
    const session = setup({ familySize: 3 })

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(choicesOf(response)).not.toContain('__skip__')
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : response.interaction.stateId)
      .toBe('confirm-next-player')
  })

  it.each([
    ['without the card', { withCard: false }],
    ['after only the second person', { placements: 1 }],
  ])('does not trigger %s', (_label, options) => {
    const session = setup(options)

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(choicesOf(response)).not.toContain('__skip__')
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : response.interaction.stateId)
      .toBe('confirm-next-player')
  })

  it('does not leak occupied choices or retrigger on an ordinary later placement', () => {
    const session = setup()

    let response = session.takeAction(0, 'day-laborer')
    response = session.resolveChoice(0, '__skip__')
    response = session.resolveChoice(1, 'confirm')
    const state = response.state
    state.currentPlayerIndex = 0
    session.loadState(state)

    expect(session.getState().actionAvailability?.['day-laborer']).toBe(false)
    response = session.takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(choicesOf(response)).not.toContain('__skip__')
    expect(getRoundPersonPlacementOrder(response.state.players[0]!)).toHaveLength(4)
  })

  it('ignores relocation entries when identifying the third person', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const clayPit = state.actionSpaces.find((space) => space.id === 'clay-pit')!
    const grainSeeds = state.actionSpaces.find((space) => space.id === 'grain-seeds')!
    removeWorkerRef(clayPit, player.id, '2')
    addWorkerRef(grainSeeds, player.id, '2')
    recordRoundPlacement(player, grainSeeds.id, '2', true)
    session.loadState(state)

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(choicesOf(response)).toContain('__skip__')
  })

  it('follows the third worker when it moves before the fourth placement choice', () => {
    const session = setup()
    let response = session.takeAction(0, 'day-laborer')
    const state = session.state
    const player = state.players[0]!
    const dayLaborer = state.actionSpaces.find((space) => space.id === 'day-laborer')!
    const grainSeeds = state.actionSpaces.find((space) => space.id === 'grain-seeds')!
    removeWorkerRef(dayLaborer, player.id, '3')
    addWorkerRef(grainSeeds, player.id, '3')
    recordRoundPlacement(player, grainSeeds.id, '3', true)

    response = acceptOptional(session, response)

    expect(choicesOf(response)).toContain('allow-occupied:grain-seeds')
    expect(choicesOf(response)).not.toContain('allow-occupied:day-laborer')
  })

  it('reuses the third worker space when Bassinet placed it beside another worker', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const other = state.players[1]!
    player.minorPlayed.push('A025_Bassinet')
    const dayLaborer = state.actionSpaces.find((space) => space.id === 'day-laborer')!
    addWorkerRef(dayLaborer, other.id, '2')
    appendImmediateEvents(state, [{ type: 'worker.placed', workerId: '2', spaceId: dayLaborer.id }], {
      actorPlayerId: other.id,
      sourceActionId: dayLaborer.id,
    })
    session.loadState(state)

    let response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === dayLaborer.id)?.takenBy)
      .toHaveLength(2)

    response = acceptOptional(session, response)

    expect(choicesOf(response)).toContain('allow-occupied:day-laborer')
  })

  it('keeps hook-payable Farmland as the fourth placement reuse option', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('C037_DwellingMound')
    player.occupationPlayed.push('C158_ForestCampaigner')
    player.resources.food = 0
    for (const space of state.actionSpaces) {
      if ((space.gainPerRound.wood ?? 0) > 0) space.resources.wood = 0
    }
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 8
    session.loadState(state)

    let response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Farmland plow')
    const tile = response.interaction.request.farm?.selectableTiles[0]
    expect(tile).toBeDefined()

    response = session.commitSelectionChoice(0, { tile })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.fields).toHaveLength(1)

    response = acceptOptional(session, response)

    expect(choicesOf(response)).toContain('allow-occupied:farmland')
  })

  it('offers the fourth person when D103 places the third person on its card', () => {
    const session = setup({ placements: 1 })
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push('D103_CanalBoatman')
    player.resources.food = 1
    state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = 2
    session.loadState(state)

    let response = session.takeAction(0, 'fishing')
    response = acceptOptional(session, response)

    expect(choicesOf(response)).toContain('__skip__')
    response = acceptOptional(session, response)
    expect(choicesOf(response)).toContain('__skip__')
    response = acceptOptional(session, response)
    expect(choicesOf(response)).toContain('day-laborer')
    expect(choicesOf(response)).not.toContain('allow-occupied:card-worker:D103_CanalBoatman')

    response = session.resolveChoice(0, 'day-laborer')

    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
    expect(getRoundPersonPlacementOrder(response.state.players[0]!)).toEqual([
      'forest',
      'fishing',
      'card:D103_CanalBoatman',
      'day-laborer',
    ])
    expect(choicesOf(response)).not.toContain('__skip__')
  })

  it('counts a normal temporary worker placement as the third person', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const temporaryWorker = player.workers.find((worker) => worker.id === '5')!
    temporaryWorker.removedFromSupply = true
    const dayLaborer = state.actionSpaces.find((space) => space.id === 'day-laborer')!
    addWorkerRef(dayLaborer, player.id, temporaryWorker.id)
    recordRoundPlacement(player, dayLaborer.id, temporaryWorker.id)
    const listener = getRegisteredCardListeners().find(
      (entry) => entry.id === 'D24-brotherly-love-after-place-farmer',
    )!

    const result = executeCardListener(listener, {
      state,
      player,
      space: dayLaborer,
      actionId: 'place-farmer',
      phase: 'after',
      actionContext: { temporaryFromSupply: true, placedWorkerId: temporaryWorker.id },
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(flow.optional).toBe(true)
    expect(flow.actionContext).toEqual({ brotherlyLoveThirdWorkerId: temporaryWorker.id })
  })

  it('does not retrigger from a relocation after the third person', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const dayLaborer = state.actionSpaces.find((space) => space.id === 'day-laborer')!
    const grainSeeds = state.actionSpaces.find((space) => space.id === 'grain-seeds')!
    addWorkerRef(dayLaborer, player.id, '3')
    recordRoundPlacement(player, dayLaborer.id, '3')
    removeWorkerRef(dayLaborer, player.id, '3')
    addWorkerRef(grainSeeds, player.id, '3')
    recordRoundPlacement(player, grainSeeds.id, '3', true)
    const listener = getRegisteredCardListeners().find(
      (entry) => entry.id === 'D24-brotherly-love-after-place-farmer',
    )!

    const result = executeCardListener(listener, {
      state,
      player,
      space: grainSeeds,
      actionId: 'place-farmer',
      phase: 'after',
      actionContext: { viaCardJump: true, workerId: '3', targetSpaceId: grainSeeds.id },
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
