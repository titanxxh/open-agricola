import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveNonSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'
import type { SessionResponse } from '../../shared/session/session-core'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A129_Swagman'
import '../../shared/cards/B/B161_Weakling'

const CARD_ID = 'B161_Weakling'
const SWAGMAN_ID = 'A129_Swagman'
const LISTENER_ID = 'B161-weakling-after-place-farmer'

const weaklingGainCount = (resp: SessionResponse): number =>
  resp.state.log.filter((entry) =>
    entry.key === 'log.cardEffectGain' && entry.params?.cardId === CARD_ID,
  ).length

describe('B161_Weakling session', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    state.players[1]!.workersAvailable = 2

    // Pile 6 wood on the Forest to create a 5+ accumulation space
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 6

    session.loadState(state)
    return session
  }

  it('gains 1 vegetable when 5+ space exists and you use a different space', () => {
    const session = setup()
    const before = session.getState().state.players[0]!.resources.vegetable
    // Use day-laborer (accumulation space but with 0 resources)
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.vegetable).toBe(before + 1)
  })

  it('does NOT gain vegetable when using the 5+ space', () => {
    const session = setup()
    const before = session.getState().state.players[0]!.resources.vegetable
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.vegetable).toBe(before)
  })

  it('does NOT gain vegetable when no space has 5+ resources', () => {
    const session = setup()
    const state = session.getState().state
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 2 // below threshold
    session.loadState(state)

    const before = state.players[0]!.resources.vegetable
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.vegetable).toBe(before)
  })

  it('gains once for the original space and once for a real-worker Swagman jump', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    state.round = 5
    player.occupationPlayed.push(SWAGMAN_ID)
    player.resources.wood = 2
    player.resources.reed = 0
    session.loadState(state)
    const before = player.resources.vegetable

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected stable prompt')
    expect(resp.interaction.request.kind).toBe('farm-select')
    if (resp.interaction.request.kind !== 'farm-select') throw new Error('expected stable prompt')
    expect(resp.interaction.request.farm.farmType).toBe('stable')
    if (resp.interaction.request.farm.farmType !== 'stable') throw new Error('expected stable prompt')
    const stable = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [stable] })
    resp = resolveTriggerIfPresent(session, resp, SWAGMAN_ID)
    resp = resolveNonSkipChoice(session, resp)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)

    expect(resp.state.players[0]!.resources.vegetable).toBe(before + 2)
    expect(weaklingGainCount(resp)).toBe(2)
  })

  it('does not trigger outside the work phase', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    state.roundPhase = 'returning-home'
    const listener = getRegisteredCardListeners().find((entry) => entry.id === LISTENER_ID)!

    const result = executeCardListener(listener, {
      state,
      player,
      space: state.actionSpaces.find((entry) => entry.id === 'day-laborer')!,
      actionId: 'place-farmer',
      phase: 'after',
      actionContext: { workerId: player.workers[0]!.id },
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('does not trigger when no farmer was placed', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const listener = getRegisteredCardListeners().find((entry) => entry.id === LISTENER_ID)!

    const result = executeCardListener(listener, {
      state,
      player,
      space: state.actionSpaces.find((entry) => entry.id === 'day-laborer')!,
      actionId: 'place-farmer',
      phase: 'after',
      actionContext: { viaCardJump: true, targetSpaceId: 'day-laborer' },
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
