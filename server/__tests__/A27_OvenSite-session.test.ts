import { type SessionResponse, GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A060_OrientalFireplace'
import { describe, expect, it } from 'vitest'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { A027_OvenSite } from '../../shared/cards/A/A027_OvenSite'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A027_OvenSite'


describe('A027_OvenSite session', () => {
  const playA27 = (session: GameSession) => {
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.improvements = ['Major_Fireplace1', 'Major_CookingHearth1']
    player.minorHand = [CARD_ID]
    player.resources = {
      ...player.resources,
      wood: 0,
      clay: 3,
      stone: 3,
    }

    // Ensure ovens available
    if (!state.availableMajorImprovements.includes('Major_ClayOven')) {
      state.availableMajorImprovements.push('Major_ClayOven')
    }
    if (!state.availableMajorImprovements.includes('Major_StoneOven')) {
      state.availableMajorImprovements.push('Major_StoneOven')
    }
    session.loadState(state)

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return resp
    const improvementOption = getChoiceOptions(resp)?.find(
      (o) => o.value.startsWith('action-improvement-'),
    )
    if (improvementOption) {
      resp = session.resolveChoice(0, improvementOption.value)
      expect(resp.ok).toBe(true)
      if (resp.interaction.stateId === 'wait' && resp.interaction.sourceCard === CARD_ID) return resp
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') return resp
    }
    const a27Option = getChoiceOptions(resp)?.find(
      (o) => o.value === CARD_ID,
    )
    expect(a27Option).toBeDefined()

    return session.resolveChoice(0, a27Option!.value)
  }

  it('gains 2 wood on play and offers Clay/Stone Oven at discount', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const resp = playA27(session)
    expect(resp.ok).toBe(true)
    // After playing A27: should have 2 wood from onBuy gain
    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(2)
    expect(player.minorPlayed).toContain(CARD_ID)
  })

  it('lets player skip the optional oven purchase', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    let resp = playA27(session)
    // Walk pending choices until either oven purchase offer or done
    const maxSteps = 10
    let steps = 0
    while (resp.interaction.stateId === 'wait' && steps < maxSteps) {
      steps += 1
      const options = getChoiceOptions(resp) ?? []
      const skip = options.find((o) => o.value === '__skip__')
      if (skip) {
        resp = session.resolveChoice(0, skip.value)
      } else {
        // No skip option → bail out; test asserts flow ended gracefully
        break
      }
    }
    // Verify card played but no oven was built
    const player = resp.state.players[0]!
    expect(player.minorPlayed).toContain(CARD_ID)
    expect(player.improvements).not.toContain('Major_ClayOven')
    expect(player.improvements).not.toContain('Major_StoneOven')
  })

  it('buys Clay Oven for 1 clay + 1 stone via the A27 discount', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    let resp = playA27(session)

    const clayBefore = resp.state.players[0]!.resources.clay
    const stoneBefore = resp.state.players[0]!.resources.stone

    const maxSteps = 12
    let steps = 0
    let clayOvenBought = false
    while (resp.interaction.stateId === 'wait' && steps < maxSteps) {
      steps += 1
      const options = getChoiceOptions(resp) ?? []
      const clayOven = options.find(
        (o) => o.value === 'Major_ClayOven',
      )
      if (clayOven && !clayOvenBought) {
        resp = session.resolveChoice(0, clayOven.value)
        clayOvenBought = true
        continue
      }
      // Fall through: pick a non-skip/non-cancel option to progress
      const progressOption = options.find(
        (o) => o.value !== '__skip__' && o.value !== 'cancel',
      )
      if (progressOption) {
        resp = session.resolveChoice(0, progressOption.value)
      } else {
        break
      }
    }

    const player = resp.state.players[0]!
    expect(player.improvements).toContain('Major_ClayOven')
    // Base Clay Oven cost is 3 clay + 1 stone = paid 1 clay + 1 stone per A27
    expect(clayBefore - player.resources.clay).toBe(1)
    expect(stoneBefore - player.resources.stone).toBe(1)
  })

  it('preserves sourceCard on the immediate bake prompt after buying Clay Oven', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const setupState = session.getState().state
    setupState.players = setupState.players.slice(0, 2)
    setupState.players[0]!.resources.grain = 1
    session.loadState(setupState)
    let resp = playA27(session)

    const maxSteps = 12
    let steps = 0
    while (resp.interaction.stateId === 'wait' && steps < maxSteps) {
      steps += 1
      const options = getChoiceOptions(resp) ?? []
      const clayOven = options.find(
        (o) => o.value === 'Major_ClayOven',
      )
      if (clayOven) {
        resp = session.resolveChoice(0, clayOven.value)
        break
      }
      const progressOption = options.find((o) => o.value !== '__skip__' && o.value !== 'cancel')
      if (progressOption) {
        resp = session.resolveChoice(0, progressOption.value)
        continue
      }
      throw new Error('expected Clay Oven offer before immediate bake prompt')
    }

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe('Major_ClayOven')
    expect(getChoiceOptions(resp)?.find((option) => option.value !== '__skip__')?.sourceCard).toBe('Major_ClayOven')
  })

  describe('prerequisite "Both Fireplace and Cooking Hearth"', () => {
    it('blocks when player owns no Fireplace + Hearth pair', () => {
      const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      const player = state.players[0]!
      player.improvements = []
      expect(session.withCtx(() => meetsCardPrerequisites(player, A027_OvenSite, state.round, state))).toBe(false)
    })

    it('allows when player owns Fireplace1 and CookingHearth1', () => {
      const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      const player = state.players[0]!
      player.improvements = ['Major_Fireplace1', 'Major_CookingHearth1']
      expect(session.withCtx(() => meetsCardPrerequisites(player, A027_OvenSite, state.round, state))).toBe(true)
    })
  })
})

describe('A027 Oven Site parity', () => {
  const CARD_ID = 'A027_OvenSite'

  const FILLER = '__test_placeholder__'

  const setup = ({
    fireplace = 'Major_Fireplace1',
    hearth = true,
    resources = {},
  }: {
    fireplace?: string | null
    hearth?: boolean
    resources?: Partial<Record<'clay' | 'stone' | 'grain', number>>
  } = {}) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6027, options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = ['Major_ClayOven', 'Major_StoneOven']
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    const player = state.players[0]!
    player.minorHand = [CARD_ID]
    player.minorPlayed = fireplace === 'A060_OrientalFireplace' ? [fireplace] : []
    player.improvements = [
      ...(fireplace && fireplace !== 'A060_OrientalFireplace' ? [fireplace] : []),
      ...(hearth ? ['Major_CookingHearth1'] : []),
    ]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, ...resources,
    }
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? getChoiceOptions(response) ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(response).some((option) => option.value === CARD_ID)) {
      const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
      if (improvement) response = session.resolveChoice(0, improvement.value)
    }
    return response
  }

  const playCard = (session: GameSession) => {
    const response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card).toBeDefined()
    return session.resolveChoice(0, card!.value)
  }

  const chooseOven = (session: GameSession, ovenId: 'Major_ClayOven' | 'Major_StoneOven') => {
    let response = playCard(session)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    const enter = options(response).find((option) => option.value !== '__skip__')
    expect(enter).toBeDefined()
    response = session.resolveChoice(0, enter!.value)
    const oven = options(response).find((option) => option.value === ovenId)
    expect(oven).toBeDefined()
    return session.resolveChoice(0, oven!.value)
  }

  it('A027 S4: Oriental Fireplace counts as the Fireplace prerequisite', () => {
    const response = playCard(setup({ fireplace: 'A060_OrientalFireplace' }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toEqual(
      expect.arrayContaining(['A060_OrientalFireplace', CARD_ID]),
    )
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })

  it('A027 S6: the immediate Stone Oven costs exactly one clay and one stone', () => {
    const response = chooseOven(setup({ resources: { clay: 1, stone: 1 } }), 'Major_StoneOven')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_StoneOven')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 0, wood: 2 })
  })
})

describe("A027 command boundaries", () => {
  const OVEN = 'A027_OvenSite'
  function setup({ resources = {}, configure = () => {} }: {
    resources?: Partial<PlayerState['resources']>
    configure?: (state: GameState) => void
  } = {}) {
    return sessionEvidence.track(createWorkSession({ seed: 4242, configure: state => {
      state.round = 14
      for (const player of state.players) {
        player.minorHand = ['B007_Wage', 'A054_Credit']
        Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
      }
      state.players[0]!.minorHand.push(OVEN)
      Object.assign(state.players[0]!.resources, resources)
      configure(state)
    } }))
  }
  function major(state: GameState, actor: number, card: string) {
    state.players[actor]!.improvements.push(card)
    state.availableMajorImprovements = state.availableMajorImprovements.filter(id => id !== card)
  }
  function oven(options: {
    fireplace?: boolean
    hearth?: boolean
    oriental?: boolean
    resources?: Partial<PlayerState['resources']>
    configure?: (state: GameState) => void
  } = {}) {
    return setup({ resources: options.resources, configure(state) {
        if (options.fireplace !== false) {
          if (options.oriental)
            state.players[0]!.minorPlayed.push('A060_OrientalFireplace')
          else
            major(state, 0, 'Major_Fireplace1')
        }
        if (options.hearth !== false)
          major(state, 0, 'Major_CookingHearth1')
        options.configure?.(state)
      } })
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function choices(r: SessionResponse) {
    ok(r)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function enter(s: GameSession, space = 'meeting-place') {
    let r = ok(s.takeAction(0, space))
    const branch = choices(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = ok(s.resolveChoice(0, branch.value))
    return r
  }
  function buy(s: GameSession, r: SessionResponse, card: string) {
    assert.ok(choices(r).some(o => o.value === card && !o.disabled))
    const result = ok(s.resolveChoice(0, card))
    assert.equal(result.state.players[0]!.minorPlayed.includes(card), true)
    assert.equal(result.state.players[0]!.minorHand.includes(card), false)
    const events = result.state.events.filter(e => e.type === 'card.played' && e.cardId === card)
    if (card === OVEN && result.interaction.stateId === 'wait' && result.interaction.request.kind === 'choice') {
      assert.equal(events.length, 0)
      return result
    }
    assert.equal(events.length, 1)
    const event = events[0]!
    assert.ok(event.type === 'card.played')
    assert.equal(event.actorPlayerId, result.state.players[0]!.id)
    assert.deepEqual(event.payment?.resources ?? {}, {})
    return result
  }
  function ovenCompleted(r: SessionResponse) {
    const events = r.state.events.filter(e => e.type === 'card.played' && e.cardId === OVEN)
    assert.equal(events.length, 1)
    const event = events[0]!
    assert.ok(event.type === 'card.played')
    assert.deepEqual(event.payment?.resources ?? {}, {})
    const gains = r.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === OVEN && e.reason === 'cardEffect')
    assert.equal(gains.length, 1)
    const gain = gains[0]!
    assert.ok(gain.type === 'resource.moved')
    assert.deepEqual(gain.resources, { wood: 2 })
  }
  function skip(s: GameSession, r: SessionResponse) {
    assert.ok(choices(r).some(o => o.value === '__skip__'))
    const result = ok(s.resolveChoice(0, '__skip__'))
    if (result.state.players[0]!.minorPlayed.includes(OVEN))
      ovenCompleted(result)
    return result
  }
  function accept(s: GameSession, response: SessionResponse, actor = 0) {
    assert.ok(response.interaction.stateId === 'wait')
    assert.equal(response.interaction.sourceCard, OVEN)
    const enabled = choices(response).filter(option => option.value !== '__skip__' && !option.disabled)
    assert.equal(enabled.length, 1, JSON.stringify(response.interaction))
    return ok(s.resolveChoice(actor, enabled[0]!.value))
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    return ok(s.takeAction(actor, space))
  }
  function offered(r: SessionResponse, card: string) {
    return choices(r).some(o => o.value === card && !o.disabled)
  }
  function ovenPurchase(s: GameSession, card: string) {
    let r = buy(s, enter(s), OVEN)
    assert.equal(r.state.players[0]!.resources.wood, 2)
    r = accept(s, r)
    assert.ok(offered(r, card))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'Major_Joinery'))
    r = ok(s.resolveChoice(0, card))
    assert.equal(r.state.players[0]!.improvements.includes(card), true)
    assert.deepEqual([r.state.players[0]!.resources.clay, r.state.players[0]!.resources.stone, r.state.players[0]!.resources.wood], [0, 0, 2])
    const events = r.state.events.filter(e => e.type === 'card.played' && e.cardId === card)
    assert.equal(events.length, 1)
    const event = events[0]!
    assert.ok(event.type === 'card.played')
    assert.deepEqual(event.payment?.resources, { clay: 1, stone: 1 })
    ovenCompleted(r)
    return r
  }
  it("actual free purchase gains two wood and declining leaves both ovens available", () => {
    const s = oven({ resources: { clay: 1, stone: 1 } })
    const r = skip(s, buy(s, enter(s), OVEN))
    assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.clay, r.state.players[0]!.resources.stone], [2, 1, 1])
    assert.ok(r.state.availableMajorImprovements.includes('Major_ClayOven'))
    assert.ok(r.state.availableMajorImprovements.includes('Major_StoneOven'))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, OVEN))
  })
  it("missing or opponent Fireplace rejects purchase before legal retry", () => {
    for (const opponent of [false, true]) {
      const s = oven({ fireplace: false, configure(state) {
          if (opponent)
            major(state, 1, 'Major_Fireplace1')
        } })
      const r = enter(s)
      assert.equal(offered(r, OVEN), false)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, OVEN))
      const done = buy(s, r, 'A054_Credit')
      assert.equal(done.state.players[0]!.resources.wood, 0)
      assert.equal(done.state.players[0]!.minorHand.includes(OVEN), true)
    }
  })
  it("missing or opponent Cooking Hearth rejects purchase before legal retry", () => {
    for (const opponent of [false, true]) {
      const s = oven({ hearth: false, configure(state) {
          if (opponent)
            major(state, 1, 'Major_CookingHearth1')
        } })
      const r = enter(s)
      assert.equal(offered(r, OVEN), false)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, OVEN))
      const done = buy(s, r, 'A054_Credit')
      assert.equal(done.state.players[0]!.resources.wood, 0)
      assert.equal(done.state.players[0]!.minorHand.includes(OVEN), true)
    }
  })
  it("Oriental Fireplace satisfies the Fireplace prerequisite", () => {
    const s = oven({ oriental: true })
    const r = buy(s, enter(s), OVEN)
    assert.equal(r.state.players[0]!.resources.wood, 2)
    assert.equal(r.state.players[0]!.improvements.includes('Major_Fireplace1'), false)
  })
  it("immediate Clay Oven pays exactly one clay and one stone", () => {
    ovenPurchase(oven({ resources: { clay: 1, stone: 1 } }), 'Major_ClayOven')
  })
  it("immediate Stone Oven pays exactly one clay and one stone", () => {
    ovenPurchase(oven({ resources: { clay: 1, stone: 1 } }), 'Major_StoneOven')
  })
  it("missing either fee resource cannot forge an immediate oven purchase", () => {
    for (const resources of [{ clay: 0, stone: 1 }, { clay: 1, stone: 0 }]) {
      const s = oven({ resources })
      const r = buy(s, enter(s), OVEN)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'Major_ClayOven'))
      assert.equal(r.state.players[0]!.improvements.includes('Major_ClayOven'), false)
      assert.deepEqual([r.state.players[0]!.resources.clay, r.state.players[0]!.resources.stone], [resources.clay, resources.stone])
      turn(s, 1, 'forest')
    }
  })
  it("an oven owned by another player is unavailable while the remaining oven is legal", () => {
    const s = oven({ resources: { clay: 1, stone: 1 }, configure(state) {
        major(state, 1, 'Major_ClayOven')
      } })
    let r = buy(s, enter(s), OVEN)
    assert.equal(offered(r, 'Major_ClayOven'), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'Major_ClayOven'))
    r = accept(s, r)
    ovenCompleted(r)
    assert.equal(r.state.players[1]!.improvements.includes('Major_ClayOven'), true)
    assert.equal(r.state.players[0]!.improvements.includes('Major_StoneOven'), true)
  })
  it("an unrelated major cannot be bought through Oven Site", () => {
    const s = oven({ resources: { clay: 2, stone: 1 } })
    let r = accept(s, buy(s, enter(s), OVEN))
    assert.equal(offered(r, 'Major_Fireplace2'), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'Major_Fireplace2'))
    r = ok(s.resolveChoice(0, 'Major_ClayOven'))
    assert.deepEqual([r.state.players[0]!.resources.clay, r.state.players[0]!.resources.stone], [1, 0])
  })
  it("after declining the immediate opportunity a later oven retains its printed price", () => {
    const s = oven({ resources: { clay: 3, stone: 1 } })
    skip(s, buy(s, enter(s), OVEN))
    turn(s, 1, 'forest')
    ready(s, 0)
    let r = enter(s, 'major-improvement')
    assert.ok(offered(r, 'Major_ClayOven'))
    r = ok(s.resolveChoice(0, 'Major_ClayOven'))
    assert.deepEqual([r.state.players[0]!.resources.clay, r.state.players[0]!.resources.stone, r.state.players[0]!.resources.wood], [0, 0, 2])
  })
  it("undo at the immediate optional opportunity uses only exposed public history", () => {
    const s = oven({ resources: { clay: 1, stone: 1 } })
    const before = undoRuleSnapshot(s.getState())
    const r = buy(s, enter(s), OVEN)
    assert.equal(r.state.players[0]!.resources.wood, 2)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    assertUndoRestored(before, s.undoAction())
  })
  it("when both ovens are already owned the free card still gains two wood without another purchase", () => {
    const s = oven({ resources: { clay: 1, stone: 1 }, configure(state) {
        major(state, 1, 'Major_ClayOven')
        major(state, 1, 'Major_StoneOven')
      } })
    const r = buy(s, enter(s), OVEN)
    assert.equal(r.state.players[0]!.resources.wood, 2)
    assert.deepEqual([r.state.players[0]!.resources.clay, r.state.players[0]!.resources.stone], [1, 1])
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'Major_ClayOven'))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'Major_StoneOven'))
    ovenCompleted(r)
    turn(s, 1, 'forest')
  })
})
