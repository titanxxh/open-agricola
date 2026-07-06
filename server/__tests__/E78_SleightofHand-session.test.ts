import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { Resource } from '../../shared/contract/types'

import '../../shared/cards/E/E078_SleightofHand'

const CARD_ID = 'E078_SleightofHand'

const setupPlaySession = (resources?: Partial<Resource>) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.occupationPlayed = ['occ-1', 'occ-2', 'occ-3']
  player.resources.wood = 2
  player.resources.clay = 1
  player.resources.stone = 0
  Object.assign(player.resources, resources)
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']
  session.loadState(state)
  return session
}

const playUntilBatchPrompt = (session: GameSession) => {
  let resp = session.takeAction(0, 'meeting-place')
  for (let safety = 0; safety < 20; safety += 1) {
    expect(resp.ok).toBe(true)
    if (
      resp.interaction.stateId === 'wait' &&
      resp.interaction.request.kind === 'resource-batch-exchange-select'
    ) {
      return resp
    }
    if (resp.interaction.stateId !== 'wait') break
    const next = resp.interaction.request.options?.find((option) => option.value !== '__skip__' && option.value !== 'cancel')
    if (!next) break
    resp = session.resolveChoice(resp.interaction.playerIndex, next.value)
  }
  throw new Error('resource batch prompt not reached')
}

describe('E078_SleightofHand session', () => {
  it('onBuy creates one batch exchange request leaf', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.wood = 2
    player.resources.clay = 1
    session.loadState(state)

    const flow = getCardEffect(CARD_ID)!.onBuy!(state, player)

    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'exchange',
      sourceCard: CARD_ID,
      actionContext: {
        batchExchange: {
          cardId: CARD_ID,
          maxTotal: 4,
        },
      },
    })
  })

  it('onBuy returns undefined when player has no building resources', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.resources.wood = 0
    player.resources.clay = 0
    player.resources.reed = 0
    player.resources.stone = 0
    session.loadState(state)

    expect(getCardEffect(CARD_ID)!.onBuy!(state, player)).toBeUndefined()
  })

  it('playing the card resolves one normalized batch resource.exchanged event', () => {
    const session = setupPlaySession()
    let resp = playUntilBatchPrompt(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('resource-batch-exchange-select')

    resp = session.commitSelectionChoice(0, {
      resourceBatchExchange: {
        discard: { wood: 2, clay: 1 },
        receive: { wood: 1, stone: 2 },
      },
    })

    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(1)
    expect(player.resources.clay).toBe(0)
    expect(player.resources.stone).toBe(2)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.exchanged',
        sourceCardId: CARD_ID,
        paid: { wood: 1, clay: 1 },
        gained: { stone: 2 },
      }),
    ]))
  })

  it('0/0 batch exchange skips without emitting resource.exchanged', () => {
    const session = setupPlaySession()
    let resp = playUntilBatchPrompt(session)
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.commitSelectionChoice(0, {
      resourceBatchExchange: { discard: {}, receive: {} },
    })
    expect(resp.ok).toBe(true)
    expect(resp.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'resource.exchanged', sourceCardId: CARD_ID }),
    ]))
  })

  it('rejects batch exchange when discard and receive totals differ', () => {
    const session = setupPlaySession()
    const resp = playUntilBatchPrompt(session)
    const rejected = session.commitSelectionChoice(0, {
      resourceBatchExchange: {
        discard: { wood: 1 },
        receive: { stone: 2 },
      },
    })

    expect(resp.interaction.stateId).toBe('wait')
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toBe('resource-batch.error.total-mismatch')
  })

  it('rejects batch exchange when discarding more than available', () => {
    const session = setupPlaySession()
    playUntilBatchPrompt(session)

    const rejected = session.commitSelectionChoice(0, {
      resourceBatchExchange: {
        discard: { wood: 3 },
        receive: { stone: 3 },
      },
    })

    expect(rejected.ok).toBe(false)
    expect(rejected.error).toBe('resource-batch.error.invalid-discard-wood')
  })

  it('rejects batch exchange when total exceeds max', () => {
    const session = setupPlaySession({ wood: 4, clay: 1 })
    playUntilBatchPrompt(session)

    const rejected = session.commitSelectionChoice(0, {
      resourceBatchExchange: {
        discard: { wood: 4, clay: 1 },
        receive: { stone: 4, reed: 1 },
      },
    })

    expect(rejected.ok).toBe(false)
    expect(rejected.error).toBe('resource-batch.error.too-many')
  })

  it('rejects batch exchange with invalid receive resource', () => {
    const session = setupPlaySession()
    playUntilBatchPrompt(session)

    const rejected = session.commitSelectionChoice(0, {
      resourceBatchExchange: {
        discard: { wood: 1 },
        receive: { food: 1 },
      },
    })

    expect(rejected.ok).toBe(false)
    expect(rejected.error).toBe('resource-batch.error.invalid-receive-food')
  })

  it('opens the batch prompt even without any normal exchange action source', () => {
    const session = setupPlaySession()
    const state = session.getState().state
  const player = state.players[0]!
  player.improvements = []
  player.occupationPlayed = ['occ-1', 'occ-2', 'occ-3']
    player.minorPlayed = [CARD_ID]
    player.resources.wood = 1
    player.resources.clay = 0
    player.resources.reed = 0
    player.resources.stone = 0
    session.loadState(state)

    const resp = playUntilBatchPrompt(session)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' && resp.interaction.request.kind)
      .toBe('resource-batch-exchange-select')
  })
})
