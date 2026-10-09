import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { executeCardListener } from '../../shared/cards/card-listeners'
import { A017_ReclamationPlow_impl } from '../../shared/cards/A/A017_ReclamationPlow'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { ActionExecutionResult } from '../../shared/contract/types'

import '../../shared/cards/A/A017_ReclamationPlow'
import '../../shared/cards/A/A137_RiverineShepherd'

const CARD_ID = 'A017_ReclamationPlow'
const A137_ID = 'A137_RiverineShepherd'
const LISTENER = A017_ReclamationPlow_impl.listeners[1]!

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { sheep: 1 },
  from: { kind: 'actionSpace', spaceId: 'sheep-market' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
  ...overrides,
})

const setupDirectContext = (
  transactionEvents: DraftGameEvent<'resource.moved'>[],
  result?: ActionExecutionResult,
): CardListenerContext => {
  const session = new GameSession(undefined, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.id = 'p1'
  player.minorPlayed.push(CARD_ID)
  player.houseAnimalType = 'sheep'
  player.houseAnimalCount = 1
  player.cardStates[CARD_ID] = {
    extraData: { animalsBeforeCollecting: { sheep: 0, boar: 0, cattle: 0 } },
  }
  const space = {
    id: 'sheep-market',
    gainPerRound: { sheep: 1 },
  }

  return {
    state,
    player,
    space,
    actionId: 'collect',
    phase: 'after',
    transactionEvents,
    result,
  } as unknown as CardListenerContext
}

describe('A017_ReclamationPlow session', () => {
  it('A017 S1: paying one wood plays Reclamation Plow', () => {
    const session = new GameSession(7017, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((candidate) => {
      setWorkersAtHome(state, candidate, 2)
      candidate.minorHand = ['__test_placeholder__']
      candidate.occupationHand = ['__test_placeholder__']
      candidate.resources.wood = 0
    })
    const player = state.players[0]!
    player.minorHand = [CARD_ID]
    player.resources.wood = 1
    session.loadState(state)

    let resp = session.takeAction(0, 'meeting-place')
    for (let guard = 0; guard < 6 && resp.state.players[0]!.minorHand.includes(CARD_ID); guard += 1) {
      if (resp.interaction.stateId !== 'wait') break
      const card = resp.interaction.request.options?.find((option) => option.value === CARD_ID)
      const branch = resp.interaction.request.options?.find((option) =>
        option.value.startsWith('action-improvement-'))
      const next = card ?? branch
      if (!next) break
      resp = session.resolveChoice(resp.interaction.playerIndex, next.value)
    }

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
  })

  it('A017 S2: fully accommodating the next animal take may plow one field and consumes the card', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market missing')
    sheepMarket.resources.sheep = 1

    session.loadState(state)

    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ])

    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionReclamationPlow' })
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(resp.interaction.playerIndex, accept!.value)
    expect(resp.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
    })
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select') return
    const tile = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(resp.interaction.playerIndex, { tile })

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.fields).toContainEqual({ ...tile, stacks: [] })
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]).toMatchObject({ flagged: true, infobox: '✓' })
  })

  it('A017 S3: declining after full accommodation consumes the next-time opportunity', () => {
    const session = new GameSession(7117, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.players[0]!.minorPlayed.push(CARD_ID)
    state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 1
    session.loadState(state)

    let resp = session.takeAction(0, 'sheep-market')
    resp = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ])
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    resp = session.resolveChoice(resp.interaction.playerIndex, '__skip__')

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.fields).toHaveLength(0)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.flagged).toBe(true)
  })

  it('does not let an existing animal hide a newly collected animal that was discarded', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.sheep = 1
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1
    player.pastures = [{
      id: 'one-space', size: 1, tiles: [{ row: 0, col: 1 }],
      stables: 0, animalType: null, animalCount: 0,
    }]
    state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 2
    session.loadState(state)

    let response = session.takeAction(0, 'sheep-market')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    response = session.resolveChoice(0, 'confirm', { zones: [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      { id: 'one-space', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 },
    ] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(2)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'farm.animalDiscarded', animals: { sheep: 1 }, reason: 'noRoom',
    }))
    expect(response.interaction.stateId === 'wait' ? response.interaction.promptKey : undefined)
      .not.toBe('ui.interactionReclamationPlow')
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
  })

  it('uses action-space resource.moved events even when result has no resourcesGained', () => {
    const ctx = setupDirectContext([moved()], { type: 'ok' })

    const result = executeCardListener(LISTENER, ctx)

    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-infobox', text: '✓' } },
        { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID, optional: true },
      ],
    })
  })

  it('ignores non-action-space animal moves even when result claims sheep gained', () => {
    const ctx = setupDirectContext([
      moved({ from: { kind: 'supply' } }),
    ], { type: 'ok', resourcesGained: { sheep: 1 } })

    const result = executeCardListener(LISTENER, ctx)

    expect(result).toBeUndefined()
  })

  it('does not read prior global state events when current transaction has no animal moves', () => {
    const ctx = setupDirectContext([], { type: 'ok', resourcesGained: { sheep: 1 } })
    ctx.state.events = [
      { type: 'worker.placed', actorPlayerId: 'p1', workerId: 'w1', spaceId: 'sheep-market' } as never,
      moved() as never,
    ]

    const result = executeCardListener(LISTENER, ctx)

    expect(result).toBeUndefined()
  })

  it('does not trigger from A137 feasibility on a non-animal Reed Bank action', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationPlayed.push(A137_ID)
    player.pastures = [
      {
        id: 'p1',
        size: 4,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    const reedBank = state.actionSpaces.find((space) => space.id === 'reed-bank')!
    reedBank.resources.reed = 2
    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')!
    sheepMarket.resources.sheep = 1

    session.loadState(state)

    let resp = session.takeAction(0, 'reed-bank')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .not.toBe('ui.interactionReclamationPlow')

    if (resp.interaction.stateId === 'wait') {
      const skip = resp.interaction.request.options?.find((option) => option.value === '__skip__')
      if (skip) resp = session.resolveChoice(0, skip.value)
    }

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .not.toBe('ui.interactionReclamationPlow')
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.flagged).toBeFalsy()
  })
})
