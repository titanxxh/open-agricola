import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A037_Bucksaw'
import '../../shared/cards/A/A055_JunkRoom'

import { afterEach, describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { createWorkSession } from './_helpers/session-fixtures'
import { expectWait } from './_helpers/trigger-select'
import { choose, restoreSession, snapshotResponse } from './_helpers/card-play-lifecycle'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit08Flow from './_helpers/audit/ae-negative-08-flow'

describe('A055_JunkRoom session log dedupe', () => {
  it('logs Junk Room gain only once when playing a minor improvement', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state

    state.players = state.players.slice(0, 2)
    state.round = 3
    state.roundPhase = 'work'
    state.currentPlayerIndex = 0
    state.players[0]!.workersAvailable = 1
    state.players[0]!.familySize = 1
    state.players[1]!.workersAvailable = 0
    state.players[1]!.familySize = 1

    const player = state.players[0]!
    player.minorPlayed = ['A055_JunkRoom']
    player.minorPlayed.push('A055_JunkRoom')
    player.minorHand = ['A037_Bucksaw']
    player.resources.wood = 1
    player.resources.food = 0

    session.loadState(state)

    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    if (resp.interaction.stateId !== 'wait') return
    const improvementOption = resp.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
    expect(improvementOption).toBeDefined()
    resp = session.resolveChoice(0, improvementOption!.value)
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait') {
      const bucksawOption = resp.interaction.request.options?.find((option) => option.value === 'A037_Bucksaw')
      if (bucksawOption) {
        resp = session.resolveChoice(0, bucksawOption.value)
        expect(resp.ok).toBe(true)
      }
    }

    const junkRoomLogs = resp.state.log.filter(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'A055_JunkRoom',
    )
    expect(junkRoomLogs).toHaveLength(1)
    expect(junkRoomLogs[0]?.params?.gain).toEqual({ food: 1 })
    expect(resp.state.players[0]!.resources.food).toBe(1)
  })
})

// #1063: migrate a local listener to existing after reactions. The real purchase
// and same-timing selection require Session tests, including self-construction.
describe('A055 Junk Room after-reaction ordering', () => {
  const CARD_ID = 'A055_JunkRoom'
  const UPHOLSTERY = 'E031_Upholstery'
  const sessions: GameSession[] = []
  afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

  const setup = (preplayed = false) => {
    const session = createWorkSession({
      seed: 1063,
      configure: (state) => {
        state.round = 14
        state.players[0]!.minorHand = [preplayed ? 'A037_Bucksaw' : CARD_ID]
        state.players[0]!.minorPlayed = preplayed ? [UPHOLSTERY, CARD_ID] : [UPHOLSTERY]
        state.players[0]!.cardStates[UPHOLSTERY] = { counters: { reed: 0, bonusVp: 0 } }
        for (const [index, player] of state.players.entries()) {
          Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 0 })
          if (index === 0) Object.assign(player.resources, { wood: 1, clay: preplayed ? 0 : 1, reed: 1 })
        }
      },
    })
    sessions.push(session)
    return session
  }

  const buyJunkRoom = (session: GameSession, cardId = CARD_ID) => {
    let response = session.takeAction(0, 'major-improvement')
    expect(response.ok, response.error).toBe(true)
    if (!response.state.players[0]!.minorPlayed.includes(cardId)) {
      const wait = expectWait(response)
      expect(wait.interaction.request.kind).toBe('choice')
      const branch = wait.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
      if (branch) response = session.resolveChoice(0, branch.value)
    }
    if (!response.state.players[0]!.minorPlayed.includes(cardId)) {
      const wait = expectWait(response)
      const card = wait.interaction.request.options?.find((option) => option.value === cardId)
      expect(card).toBeDefined()
      response = session.resolveChoice(0, card!.value)
    }
    return expectWait(response)
  }

  const gainLogs = (response: SessionResponse) => response.state.log.filter((entry) =>
    entry.key === 'log.cardEffectGain' && entry.params?.cardId === CARD_ID)

  it('grants its own food in onBuy before another card reacts, including restore and undo', () => {
    const session = setup()
    const before = snapshotResponse(session.getState())
    let response: SessionResponse = buyJunkRoom(session)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: UPHOLSTERY, request: { kind: 'choice' } })
    expect(response.interaction.request?.options?.some((option) => option.value === CARD_ID)).toBe(false)
    const restored = restoreSession(session)
    sessions.push(restored)
    response = restored.getState()
    if (response.interaction.stateId !== 'wait') throw new Error('Expected Upholstery choice')
    const accept = response.interaction.request.options!.find((option) => option.value !== '__skip__')!
    response = choose(restored, response, accept.value)
    expect(response.state.players[0]!.resources.food).toBe(1)
    response = restored.undoStep()
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.interaction.request?.options?.some((option) => option.value === CARD_ID)).toBe(false)
    response = choose(restored, response, '__skip__')
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(gainLogs(response)).toHaveLength(1)
    expect(snapshotResponse(restored.undoAction())).toEqual(before)
  })

  it.each([CARD_ID, UPHOLSTERY])('lets the owner choose %s first and reconstructs the selection after undo', (first) => {
    const session = setup(true)
    const before = session.getState()
    const resourcesBefore = { ...before.state.players[0]!.resources }
    const scoresBefore = structuredClone(before.scores)
    const logsBefore = structuredClone(before.state.log)
    let response: SessionResponse = buyJunkRoom(session, 'A037_Bucksaw')
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 1, food: 0 })
    expect(gainLogs(response)).toEqual([])
    expect(response.interaction.request?.kind).toBe('select-trigger')
    expect(response.interaction.request?.options?.map((option) => option.value))
      .toEqual(expect.arrayContaining([CARD_ID, UPHOLSTERY]))
    expect(response.interaction.request?.options?.find((option) => option.value === '__pass__')?.disabled).toBe(true)
    const purchaseScores = structuredClone(response.scores)
    const purchaseLogs = structuredClone(response.state.log)

    const resolve = (source: string) => {
      response = session.resolveChoice(0, source)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({
        food: source === CARD_ID ? 1 : 0,
        reed: 1,
      })
      if (source === UPHOLSTERY) {
        expect(response.interaction).toMatchObject({
          stateId: 'wait', sourceCard: UPHOLSTERY, request: { kind: 'choice' },
        })
      }
      // The host's transaction publishes its card logs when all reactions drain.
      expect(response.state.log).toEqual(purchaseLogs)
      expect(response.scores).toEqual(purchaseScores)
    }

    const acceptUpholstery = () => {
      const wait = expectWait(response)
      expect(wait.interaction.sourceCard).toBe(UPHOLSTERY)
      expect(wait.interaction.request.kind).toBe('choice')
      const accept = wait.interaction.request.options?.find((option) => option.value !== '__skip__')
      expect(accept?.effectPreview).toMatchObject({ kind: 'payment', resourcesPaid: { reed: 1 } })
      response = session.resolveChoice(0, accept!.value)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.reed).toBe(0)
      expect(response.state.players[0]!.cardStates[UPHOLSTERY]?.counters).toMatchObject({ reed: 1, bonusVp: 1 })
      expect(response.scores![0]!.total).toBe(purchaseScores![0]!.total + 1)
    }

    resolve(first)
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request?.kind).toBe('select-trigger')
    expect(response.interaction.request?.options?.map((option) => option.value))
      .toEqual(expect.arrayContaining([CARD_ID, UPHOLSTERY]))
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 1, food: 0 })
    expect(response.state.players[0]!.cardStates[UPHOLSTERY]?.counters).toEqual({ reed: 0, bonusVp: 0 })
    expect(response.state.log).toEqual(purchaseLogs)
    expect(response.scores).toEqual(purchaseScores)

    resolve(first)
    if (first === UPHOLSTERY) acceptUpholstery()
    const second = first === CARD_ID ? UPHOLSTERY : CARD_ID
    const remaining = expectWait(response)
    expect(remaining.interaction.request.kind).toBe('select-trigger')
    expect(remaining.interaction.request.options?.some((option) => option.value === first)).toBe(false)
    response = session.resolveChoice(0, second)
    expect(response.ok, response.error).toBe(true)
    if (second === UPHOLSTERY) acceptUpholstery()
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, food: 1 })
    expect(response.state.players[0]!.cardStates[UPHOLSTERY]?.counters).toMatchObject({ reed: 1, bonusVp: 1 })
    expect(gainLogs(response)).toHaveLength(1)
    expect(response.scores![0]!.total).toBe(purchaseScores![0]!.total + 1)
    expect(response.scores![1]).toEqual(scoresBefore![1])
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })

    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual(resourcesBefore)
    expect(response.state.players[0]!.minorHand).toEqual(['A037_Bucksaw'])
    expect(response.state.players[0]!.minorPlayed).toEqual([UPHOLSTERY, CARD_ID])
    expect(response.state.players[0]!.cardStates[UPHOLSTERY]?.counters).toEqual({ reed: 0, bonusVp: 0 })
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.log).toEqual(logsBefore)
    expect(response.scores).toEqual(scoresBefore)
    expect(buyJunkRoom(session, 'A037_Bucksaw').interaction.request.kind).toBe('select-trigger')
  })
})

describe('A055 Junk Room parity', () => {
  const CARD_ID = 'A055_JunkRoom'

  const MINOR_ID = 'A037_Bucksaw'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, actor = 0, ownerResources = {}, actorResources = {},
  }: {
    played?: boolean
    actor?: number
    ownerResources?: Partial<Record<'wood' | 'clay', number>>
    actorResources?: Partial<Record<'wood' | 'clay', number>>
  } = {}) => {
    const session = new GameSession(6055, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = actor
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = ['Major_Fireplace1']
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0,
        ...(index === 0 ? ownerResources : {}),
        ...(index === actor ? actorResources : {}),
      }
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const playImprovement = (session: GameSession, playerIndex: number, cardId: string) => {
    let response = session.takeAction(playerIndex, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(response).some((option) => option.value === cardId)) {
      const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
      if (improvement) response = session.resolveChoice(playerIndex, improvement.value)
    }
    if (
      response.state.players[playerIndex]!.minorPlayed.includes(cardId)
      || response.state.players[playerIndex]!.improvements.includes(cardId)
    ) return response
    const card = options(response).find((option) => option.value === cardId)
    expect(card).toBeDefined()
    return session.resolveChoice(playerIndex, card!.value)
  }

  it('A055 S1: playing Junk Room pays one wood and one clay and gains one food from itself', () => {
    const response = playImprovement(setup({
      played: false, ownerResources: { wood: 1, clay: 1 },
    }), 0, CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, food: 1 })
  })

  it('A055 S2: building a later minor improvement gains one food', () => {
    const session = setup({ actorResources: { wood: 1 } })
    session.state.players[0]!.minorHand = [MINOR_ID]

    const response = playImprovement(session, 0, MINOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toEqual(expect.arrayContaining([CARD_ID, MINOR_ID]))
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 1 })
  })

  it('A055 S3: building a major improvement gains one food', () => {
    const response = playImprovement(setup({ actorResources: { clay: 2 } }), 0, 'Major_Fireplace1')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 1 })
  })

  it('A055 S4: taking a non-improvement action grants no food', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 0 })
  })

  it('A055 S5: an opponent building an improvement grants the owner no food', () => {
    const session = setup({ actor: 1, actorResources: { wood: 1 } })
    session.state.players[1]!.minorHand = [MINOR_ID]

    const response = playImprovement(session, 1, MINOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 0, food: 0 })
  })
})

describe('ae-negative-08-flow', () => {
  const { JUNK, BUCK, UPHOLSTERY, sessions, ok, opts, turn, buy, deny, improve, gainCount, resource, junk, source, purchaseUndo } = audit08Flow
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A055 N1 missing wood or clay rejects before exact self reward once', () => {
    for (const resources of [{ wood: 0, clay: 1, food: 0 }, { wood: 1, clay: 0, food: 0 }]) deny(junk({ played: false, resources }), JUNK); const r = buy(junk({ played: false, resources: { wood: 1, clay: 1, food: 0 } }), JUNK); resource(r, 'wood', 0); assert.equal(r.state.players[0]!.resources.clay, 0); resource(r, 'food', 1); assert.equal(gainCount(r, JUNK), 1)
  })
  it('A055 N2 actual later minor gives one food and stale purchase cannot repeat reward', () => {
    const s = junk({ hand: [BUCK], resources: { wood: 1, food: 0 } }); const r = improve(s, BUCK); resource(r, 'wood', 0); resource(r, 'food', 1); assert.equal(gainCount(r, JUNK), 1); assertRejectedUnchanged(s, () => s.resolveChoice(0, BUCK))
  })
  it('A055 N3 actual major purchase rewards owner once compared with no-card control', () => {
    for (const noCard of [false, true]) { const r = improve(junk({ noCard, resources: { clay: 2, food: 0 } }), 'Major_Fireplace1'); assert.equal(r.state.players[0]!.resources.clay, 0); resource(r, 'food', noCard ? 0 : 1); assert.ok(r.state.players[0]!.improvements.includes('Major_Fireplace1')) }
  })
  it('A055 N4 decline foreign purchase and nonimprovement grant no holder food', () => {
    const skip = junk({ hand: [BUCK], resources: { wood: 1, food: 0 } }); const offer = turn(skip, 0, 'meeting-place'); assert.ok(opts(offer).some(o => o.value === '__skip__')); resource(ok(skip.resolveChoice(0, '__skip__')), 'food', 0)
    const s = junk({ opponentHand: [BUCK], opponent: { wood: 1, food: 0 } }); turn(s, 0, 'forest'); const r = improve(s, BUCK, 1); resource(r, 'food', 0); resource(r, 'food', 0, 1); assert.ok(r.state.players[1]!.minorPlayed.includes(BUCK)); resource(turn(junk(), 0, 'day-laborer'), 'food', 2)
  })
  it('A055 N5 self and later purchase undo restore fee and one replay reward', () => {
    for (const played of [false, true]) { const s = junk({ played, hand: played ? [BUCK] : [], resources: { wood: 1, clay: played ? 0 : 1, food: 0 } }); const before = undoRuleSnapshot(s.getState()); const card = played ? BUCK : JUNK; const r = buy(s, card); resource(r, 'food', 1); assert.equal(gainCount(r, JUNK), 1); purchaseUndo(before, s.undoAction()); const replay = buy(s, card); resource(replay, 'food', 1); assert.equal(gainCount(replay, JUNK), 1) }
  })
  it('A055 N6 two after sources reject consumed source and undo first response restores choice', () => {
    for (const first of [JUNK, UPHOLSTERY]) { const s = junk({ extra: [UPHOLSTERY], hand: [BUCK], resources: { wood: 1, reed: 1, food: 0 } }); const initial = improve(s, BUCK); assert.ok(initial.interaction.stateId === 'wait' && initial.interaction.request.kind === 'select-trigger'); assertRejectedUnchanged(s, () => s.resolveChoice(1, first)); const chosen = ok(s.resolveChoice(0, first)); resource(chosen, 'food', first === JUNK ? 1 : 0); const undone = ok(s.undoStep()); assert.ok(undone.interaction.stateId === 'wait' && undone.interaction.request.kind === 'select-trigger'); assert.deepEqual(opts(undone).filter(o => [JUNK, UPHOLSTERY].includes(o.value)).map(o => o.value).sort(), [JUNK, UPHOLSTERY].sort()); resource(undone, 'food', 0); let r = source(s, undone, first); const second = first === JUNK ? UPHOLSTERY : JUNK; assertRejectedUnchanged(s, () => s.resolveChoice(0, first)); r = source(s, r, second); resource(r, 'food', 1); assert.equal(r.state.players[0]!.resources.reed, 0); assert.equal(r.state.players[0]!.cardStates[UPHOLSTERY]?.counters?.reed, 1); assert.equal(gainCount(r, JUNK), 1) }
  })
})
