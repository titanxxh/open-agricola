import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { PrivateGameEvent } from '../../shared/contract/protocol/game'
import { getActionDefinition } from '../../shared/actions'
import type { ActionExecutionContext, ActionSpace } from '../../shared/contract/types'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { B003_Moonshine_impl } from '../../shared/cards/B/B003_Moonshine'

import '../../shared/cards/A/A016_RammedClay'
import '../../shared/cards/A/A095_Angler'
import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/B/B003_Moonshine'
import '../../shared/cards/B/B146_Illusionist'

const handChangedEvent = (recipientPlayerId: string, cardIds: string[]): PrivateGameEvent => ({
  schemaVersion: 1,
  type: 'private.handChanged',
  recipientPlayerId,
  cardIds,
  cardType: 'minor',
  reason: 'card-effect',
  sourceCard: '__TEST_PRIVATE_EVENT_SOURCE__',
})

type ResponsePrivateEventEmitter = {
  emitResponsePrivateEvent: (event: PrivateGameEvent) => void
}

const responseEmitter = (session: GameSession): ResponsePrivateEventEmitter =>
  session as unknown as ResponsePrivateEventEmitter

const B146_DISCARD_ACTION_ID = 'card_B146_Illusionist_discard-from-hand'
const B003_CARD_ID = 'B003_Moonshine'
const A095_CARD_ID = 'A095_Angler'
const A006_MINOR_ID = 'A016_RammedClay'
const TEST_OCCUPATION_ID = 'A116_WoodCutter'

const makeSpace = (id = 'test-space'): ActionSpace => ({
  id,
  nameKey: `actions.${id}.name`,
  descriptionKey: `actions.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  resources: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
} as unknown as ActionSpace)

const expectOnlyHandEvents = (
  privateEvents: PrivateGameEvent[] | undefined,
  expected: Array<{
    recipientPlayerId: string
    cardIds: string[]
    cardType: 'minor' | 'occupation' | 'mixed'
    sourceCard: string
    sourceActionId?: string
  }>,
) => {
  expect(privateEvents).toEqual(expected.map((entry) => ({
    schemaVersion: 1,
    type: 'private.handChanged',
    recipientPlayerId: entry.recipientPlayerId,
    cardIds: entry.cardIds,
    cardType: entry.cardType,
    reason: 'card-effect',
    sourceCard: entry.sourceCard,
    ...(entry.sourceActionId ? { sourceActionId: entry.sourceActionId } : {}),
  })))
}

const setupTwoPlayerSession = () => {
  const session = new GameSession(42, undefined, { playerCount: 4 })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  for (const player of state.players) {
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }

  session.loadState(state)
  return session
}

const resolveMinorFromPrompt = (
  session: GameSession,
  resp: ReturnType<GameSession['takeAction']>,
  cardId: string,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const improvementOption = resp.interaction.options?.find((option) => option.value.startsWith('action-improvement-'))
  if (improvementOption) {
    resp = session.resolveChoice(0, improvementOption.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return resp
  }
  if (resp.interaction.sourceCard === cardId) return resp
  const cardOption = resp.interaction.options?.find((option) => option.value === `minor:${cardId}`)
  expect(cardOption).toBeDefined()
  return session.resolveChoice(0, cardOption!.value)
}

const playB3 = (session: GameSession) => {
  const resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  return resolveMinorFromPrompt(session, resp, B003_CARD_ID)
}

const setupAnglerSession = () => {
  const session = setupTwoPlayerSession()
  const state = session.getState().state
  const player = state.players[0]!
  player.occupationPlayed.push(A095_CARD_ID)
  player.minorHand = [A006_MINOR_ID]
  const fishing = state.actionSpaces.find((space) => space.id === 'fishing')
  if (!fishing) throw new Error('fishing space missing')
  fishing.resources.food = 2
  session.loadState(state)
  return session
}

describe('card effect hand notification response plumbing', () => {
  it('explicit privateEvents are returned without entering state.events', () => {
    const session = new GameSession()
    const playerId = session.getState().state.players[0]!.id
    const event = handChangedEvent(playerId, ['A001_TestCard'])

    const resp = session.emitResponse(true, undefined, [event])

    expect(resp.privateEvents).toEqual([event])
    expect(resp.state.events).not.toEqual(expect.arrayContaining([event]))
  })

  it('buffered private events are drained once on successful responses', () => {
    const session = new GameSession()
    const playerId = session.getState().state.players[0]!.id
    const event = handChangedEvent(playerId, ['A002_TestCard'])

    responseEmitter(session).emitResponsePrivateEvent(event)

    const first = session.emitResponse()
    const second = session.emitResponse()

    expect(first.privateEvents).toEqual([event])
    expect(second.privateEvents).toBeUndefined()
    expect(first.state.events).not.toEqual(expect.arrayContaining([event]))
  })

  it('failed responses clear buffered private events without leaking stale events', () => {
    const session = new GameSession()
    const playerId = session.getState().state.players[0]!.id
    const event = handChangedEvent(playerId, ['A003_TestCard'])

    responseEmitter(session).emitResponsePrivateEvent(event)

    const failed = session.emitResponse(false, 'private event source failed')
    const next = session.emitResponse()

    expect(failed.privateEvents).toBeUndefined()
    expect(next.privateEvents).toBeUndefined()
  })
})

describe('card effect hand notification events', () => {
  it('B146 discard action emits a target-only private event for an occupation discard', () => {
    const def = getActionDefinition(B146_DISCARD_ACTION_ID)!
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationHand = [TEST_OCCUPATION_ID]

    const result = def.resolveChoice!(
      {
        state,
        player,
        space: makeSpace(),
        params: {},
        emitPrivateEvent: (event) => responseEmitter(session).emitResponsePrivateEvent(event),
      } as ActionExecutionContext,
      `occ:${TEST_OCCUPATION_ID}`,
    )
    const resp = session.emitResponse(result.type !== 'fail')

    expect(result.type).toBe('ok')
    expect(resp.state.players[0]!.occupationHand).not.toContain(TEST_OCCUPATION_ID)
    expectOnlyHandEvents(resp.privateEvents, [{
      recipientPlayerId: player.id,
      cardIds: [TEST_OCCUPATION_ID],
      cardType: 'occupation',
      sourceCard: 'B146_Illusionist',
      sourceActionId: B146_DISCARD_ACTION_ID,
    }])
    expect(resp.state.events).not.toEqual(expect.arrayContaining(resp.privateEvents ?? []))
  })

  it('B146 discard action emits a target-only private event for a minor discard', () => {
    const def = getActionDefinition(B146_DISCARD_ACTION_ID)!
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorHand = [A006_MINOR_ID]

    const result = def.resolveChoice!(
      {
        state,
        player,
        space: makeSpace(),
        params: {},
        emitPrivateEvent: (event) => responseEmitter(session).emitResponsePrivateEvent(event),
      } as ActionExecutionContext,
      `min:${A006_MINOR_ID}`,
    )
    const resp = session.emitResponse(result.type !== 'fail')

    expect(result.type).toBe('ok')
    expect(resp.state.players[0]!.minorHand).not.toContain(A006_MINOR_ID)
    expectOnlyHandEvents(resp.privateEvents, [{
      recipientPlayerId: player.id,
      cardIds: [A006_MINOR_ID],
      cardType: 'minor',
      sourceCard: 'B146_Illusionist',
      sourceActionId: B146_DISCARD_ACTION_ID,
    }])
    expect(resp.state.events).not.toEqual(expect.arrayContaining(resp.privateEvents ?? []))
  })

  it('B3 pass branch emits private hand events for original and receiving players', () => {
    const session = setupTwoPlayerSession()
    const state = session.getState().state
    state.players[0]!.minorHand = [B003_CARD_ID]
    state.players[0]!.occupationHand = [TEST_OCCUPATION_ID]
    state.players[0]!.resources.food = 3
    session.loadState(state)

    const b3Resp = playB3(session)
    expect(b3Resp.interaction.stateId).toBe('wait')

    const passResp = session.resolveChoice(0, 'pass')
    const p0 = passResp.state.players[0]!
    const p1 = passResp.state.players[1]!

    expect(p0.occupationHand).not.toContain(TEST_OCCUPATION_ID)
    expect(p1.occupationHand).toContain(TEST_OCCUPATION_ID)
    expectOnlyHandEvents(passResp.privateEvents, [
      {
        recipientPlayerId: p0.id,
        cardIds: [TEST_OCCUPATION_ID],
        cardType: 'occupation',
        sourceCard: B003_CARD_ID,
      },
      {
        recipientPlayerId: p1.id,
        cardIds: [TEST_OCCUPATION_ID],
        cardType: 'occupation',
        sourceCard: B003_CARD_ID,
      },
    ])
  })

  it('B3 pass branch in solo emits only the source player private event', () => {
    const session = setupTwoPlayerSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 1)
    const player = state.players[0]!
    player.occupationHand = [TEST_OCCUPATION_ID]
    writeCardExtraData(player, B003_CARD_ID, 'occ', TEST_OCCUPATION_ID)

    const events: PrivateGameEvent[] = []
    B003_Moonshine_impl.effect.resolveChoice?.(state, player, 'pass', {
      sourceCard: B003_CARD_ID,
      emitPrivateEvent: (event) => events.push(event),
    })

    expect(player.occupationHand).not.toContain(TEST_OCCUPATION_ID)
    expectOnlyHandEvents(events, [{
      recipientPlayerId: player.id,
      cardIds: [TEST_OCCUPATION_ID],
      cardType: 'occupation',
      sourceCard: B003_CARD_ID,
    }])
  })

  it('B3 play branch emits a private event when its picked occupation leaves hand', () => {
    const session = setupTwoPlayerSession()
    const state = session.getState().state
    state.players[0]!.minorHand = [B003_CARD_ID]
    state.players[0]!.occupationHand = [TEST_OCCUPATION_ID]
    state.players[0]!.resources.food = 3
    session.loadState(state)

    const b3Resp = playB3(session)
    expect(b3Resp.interaction.stateId).toBe('wait')

    const playResp = session.resolveChoice(0, 'play')
    const player = playResp.state.players[0]!

    expect(player.occupationHand).not.toContain(TEST_OCCUPATION_ID)
    expect(player.occupationPlayed).toContain(TEST_OCCUPATION_ID)
    expectOnlyHandEvents(playResp.privateEvents, [{
      recipientPlayerId: player.id,
      cardIds: [TEST_OCCUPATION_ID],
      cardType: 'occupation',
      sourceCard: B003_CARD_ID,
    }])
  })

  it('A95 optional improvement emits a private event when the minor leaves hand', () => {
    const session = setupAnglerSession()

    let resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    if (resp.interaction.stateId === 'wait') {
      const hasMinorChoice = resp.interaction.options?.some(
        (option) => option.value.startsWith('action-improvement-') || option.value === `minor:${A006_MINOR_ID}`,
      )
      if (hasMinorChoice) {
        resp = resolveMinorFromPrompt(session, resp, A006_MINOR_ID)
      }
    }

    const player = resp.state.players[0]!
    expect(player.minorHand).not.toContain(A006_MINOR_ID)
    expect(player.minorPlayed).toContain(A006_MINOR_ID)
    expectOnlyHandEvents(resp.privateEvents, [{
      recipientPlayerId: player.id,
      cardIds: [A006_MINOR_ID],
      cardType: 'minor',
      sourceCard: A095_CARD_ID,
    }])
  })

  it('ordinary lessons and ordinary minor improvement do not emit handChanged private events', () => {
    const lessonsSession = setupTwoPlayerSession()
    const lessonsState = lessonsSession.getState().state
    lessonsState.players[0]!.occupationHand = [TEST_OCCUPATION_ID]
    lessonsSession.loadState(lessonsState)

    let resp = lessonsSession.takeAction(0, 'lessons')
    if (
      resp.interaction.stateId === 'wait' &&
      resp.interaction.options?.some((option) => option.value === TEST_OCCUPATION_ID)
    ) {
      resp = lessonsSession.resolveChoice(0, TEST_OCCUPATION_ID)
    }
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationPlayed).toContain(TEST_OCCUPATION_ID)
    expect(resp.privateEvents).toBeUndefined()

    const minorSession = setupTwoPlayerSession()
    const minorState = minorSession.getState().state
    minorState.players[0]!.minorHand = [A006_MINOR_ID]
    minorSession.loadState(minorState)

    resp = minorSession.takeAction(0, 'meeting-place')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = minorSession.resolveChoice(0, accept!.value)
    if (resp.interaction.stateId === 'wait') {
      const hasMinorChoice = resp.interaction.options?.some(
        (option) => option.value.startsWith('action-improvement-') || option.value === `minor:${A006_MINOR_ID}`,
      )
      if (hasMinorChoice) {
        resp = resolveMinorFromPrompt(minorSession, resp, A006_MINOR_ID)
      }
    }
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(A006_MINOR_ID)
    expect(resp.privateEvents).toBeUndefined()
  })
})
