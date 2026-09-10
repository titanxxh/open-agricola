import { type SessionResponse } from '../game/authoritative-session'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import type { ActionDetailParts } from '../../shared/contract/protocol/game'
import { mkActionSpace } from '../../shared/cards/__tests__/fixtures'
import { gainAction } from '../../shared/actions/effects/gain'
import { setWorkersAtHome } from '../../shared/domain/player'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/B/B138_ForestGuardian'

const CARD_ID = 'B138_ForestGuardian'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const resolveConfirms = (session: GameSession) => {
  let resp = session.getState()
  let safety = 20
  while (
    resp.interaction.stateId === 'wait'
    && (
      resp.interaction.request.kind === 'confirm-player-switch'
      || resp.interaction.request.kind === 'confirm-next-player'
    )
  ) {
    if (--safety <= 0) throw new Error('confirm loop did not settle')
    resp = resp.interaction.request.kind === 'confirm-player-switch'
      ? confirmPlayerSwitch(session)
      : confirmNextPlayer(session)
  }
  return resp
}

describe('B138_ForestGuardian session — opponent pays food on 5+ wood collect', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.occupationPlayed.push(CARD_ID)
    owner.resources.food = 5
    opponent.resources.food = 3
    return { session, state, owner, opponent }
  }

  it('listener fires when opponent collects forest with 5+ wood, returns gain leaf with payerId', () => {
    const listener = findListener('B138-forest-guardian-before-opponent-collect')
    expect(listener).toBeDefined()

    const { state, owner, opponent } = setup()
    const space = mkActionSpace({ id: 'forest', resources: { wood: 5 } })

    const result = executeCardListener(listener!, {
      state,
      player: opponent,
      space,
      actionId: 'collect',
      phase: 'before',
      result: { type: 'ok' },
      ownerPlayer: owner,
      triggerPlayer: opponent,
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('seq')
    if (result!.flow?.type === 'seq') {
      const leaf = result!.flow.children[0]
      expect(leaf?.type).toBe('leaf')
      if (leaf?.type === 'leaf') {
        expect(leaf.actionId).toBe('gain')
        expect(leaf.params).toEqual({
          food: 1,
          recipientPlayerId: owner.id,
          payerId: opponent.id,
        })
      }
    }
  })

  it('listener does NOT fire below 5 wood threshold', () => {
    const listener = findListener('B138-forest-guardian-before-opponent-collect')
    const { state, owner, opponent } = setup()
    const space = mkActionSpace({ id: 'forest', resources: { wood: 4 } })

    const result = executeCardListener(listener!, {
      state,
      player: opponent,
      space,
      actionId: 'collect',
      phase: 'before',
      result: { type: 'ok' },
      ownerPlayer: owner,
      triggerPlayer: opponent,
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('listener does NOT fire on non-wood spaces', () => {
    const listener = findListener('B138-forest-guardian-before-opponent-collect')
    const { state, owner, opponent } = setup()
    const space = mkActionSpace({ id: 'fishing', resources: { wood: 5, food: 1 } })

    const result = executeCardListener(listener!, {
      state,
      player: opponent,
      space,
      actionId: 'collect',
      phase: 'before',
      result: { type: 'ok' },
      ownerPlayer: owner,
      triggerPlayer: opponent,
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('gain leaf with payerId actually deducts opponent food and credits owner', () => {
    const { state, owner, opponent } = setup()
    const space = mkActionSpace({ id: 'forest' })

    const ownerFoodBefore = owner.resources.food
    const opponentFoodBefore = opponent.resources.food

    // Simulate the leaf executing under owner context (PlayerSwitch upstream).
    const result = gainAction.execute({
      state,
      player: owner,
      space,
      params: {
        food: 1,
        recipientPlayerId: owner.id,
        payerId: opponent.id,
      },
      sourceCard: CARD_ID,
    })

    expect(result.type).toBe('ok')
    if (result.type === 'ok') {
      expect(result.extraData?.actionDetailDeltas).toEqual([
        { playerId: opponent.id, costs: { food: 1 } },
      ])
    }
    expect(owner.resources.food).toBe(ownerFoodBefore + 1)
    expect(opponent.resources.food).toBe(opponentFoodBefore - 1)
  })

  it('gain payerId rejects an insufficient transfer without minting food', () => {
    const { state, owner, opponent } = setup()
    opponent.resources.food = 0
    const space = mkActionSpace({ id: 'forest' })

    gainAction.execute({
      state,
      player: owner,
      space,
      params: {
        food: 1,
        recipientPlayerId: owner.id,
        payerId: opponent.id,
      },
      sourceCard: CARD_ID,
    })

    expect(opponent.resources.food).toBe(0)
    expect(owner.resources.food).toBe(5)
  })

  it('logs opponent payment cost on the forest action detail', () => {
    const { session, state, owner, opponent } = setup()
    state.currentPlayerIndex = 1
    state.round = 1
    setWorkersAtHome(state, owner, 2)
    setWorkersAtHome(state, opponent, 2)
    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    forest.resources.wood = 5
    session.loadState(state)

    const resp = session.takeAction(1, 'forest')
    expect(resp.ok).toBe(true)
    resolveConfirms(session)

    const after = session.getState().state
    expect(after.players[1]!.resources.food).toBe(2)
    expect(after.players[1]!.resources.wood).toBe(5)

    const actionDetail = after.log.find((entry) =>
      entry.key === 'log.actionDetail'
      && entry.params?.player === opponent.name
      && entry.params?.action === 'actions.forest.name',
    )
    expect(actionDetail).toBeDefined()
    const detailParts = actionDetail?.params?.detailParts as ActionDetailParts | undefined
    expect(detailParts?.gains?.wood).toBe(5)
    expect(detailParts?.costs?.food).toBe(1)
    expect(detailParts?.gains?.food ?? 0).toBe(0)
  })
})

describe('B138 Forest Guardian parity', () => {
  const CARD_ID = 'B138_ForestGuardian'

  const FILLER = '__test_placeholder__'

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setup = ({
    played = true, actor = 0, actorFood = 0, forestWood = 5,
  }: {
    played?: boolean
    actor?: number
    actorFood?: number
    forestWood?: number
  } = {}) => {
    const session = new GameSession(6138, undefined, { playerCount: 3 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = actor
    state.round = 5
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    state.players[actor]!.resources.food = actorFood
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = forestWood
    state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed = 5
    session.loadState(state)
    return session
  }

  const playOccupation = (session: GameSession) => {
    let response = session.takeAction(0, 'lessons')
    if (response.interaction.stateId === 'wait'
      && response.state.players[0]!.occupationHand.includes(CARD_ID)) {
      const card = options(response).find((option) => option.value === CARD_ID)
      expect(card, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, card!.value)
    }
    return resolveTriggerIfPresent(session, response, CARD_ID)
  }

  const settleCrossPlayerTrigger = (session: GameSession, initial: SessionResponse) => {
    let response = resolveTriggerIfPresent(session, initial, CARD_ID)
    for (let remaining = 8; remaining > 0
      && response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'confirm-player-switch'; remaining -= 1) {
      response = confirmPlayerSwitch(session)
      response = resolveTriggerIfPresent(session, response, CARD_ID)
    }
    return response
  }

  it('B138 S1: playing Forest Guardian immediately gains two wood', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })

  it('B138 S3: taking only four wood requires no Forest Guardian payment', () => {
    const session = setup({ actor: 1, actorFood: 1, forestWood: 4 })

    const response = settleCrossPlayerTrigger(session, session.takeAction(1, 'forest'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[1]!.resources).toMatchObject({ food: 1, wood: 4 })
  })

  it('B138 S4: the owner taking five wood pays nobody', () => {
    const session = setup()

    const response = settleCrossPlayerTrigger(session, session.takeAction(0, 'forest'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 5 })
  })

  it('B138 S5: an opponent taking a non-wood accumulation pays nothing', () => {
    const session = setup({ actor: 1, actorFood: 1 })

    const response = settleCrossPlayerTrigger(session, session.takeAction(1, 'reed-bank'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[1]!.resources).toMatchObject({ food: 1, reed: 5 })
  })
})
