import { assertUndoRestored, undoRuleSnapshot } from './_helpers/session-assertions'
import { describe, expect, it } from 'vitest'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { sessionOptions, setupOccupationSession } from './_helpers/batch07-card-play'
import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/A/A125_Priest'
import '../../shared/cards/A/A131_CraftTeacher'
import assert from 'node:assert/strict'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

describe('A131 Craft Teacher through Session', () => {
  it('plays two occupations for free after Joinery', () => {
    const session = sessionEvidence.track(setupOccupationSession({
      cardId: 'A131_CraftTeacher',
      playerCount: 3,
      played: ['A131_CraftTeacher'],
      hand: ['A116_WoodCutter', 'A125_Priest'],
    }))
    Object.assign(session.state.players[0]!.resources, { wood: 2, stone: 2 })
    session.state.availableMajorImprovements = ['Major_Joinery']
    session.loadState(session.state)

    let response = session.takeAction(0, 'major-improvement')
    for (let guard = 0; guard < 4 && !response.state.players[0]!.improvements.includes('Major_Joinery'); guard += 1) {
      if (response.interaction.stateId !== 'wait') break
      const next = sessionOptions(response).find((entry) => entry.value === 'Major_Joinery')
        ?? sessionOptions(response).find((entry) => entry.value !== 'cancel')
      expect(next, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, next!.value)
    }
    response = resolveTriggerIfPresent(session, response, 'A131_CraftTeacher')
    if (response.interaction.stateId === 'wait') {
      const takeTwo = sessionOptions(response).filter((entry) => entry.value !== '__skip__').at(-1)!
      expect(takeTwo, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, takeTwo.value)
    }
    for (const occupationId of ['A116_WoodCutter', 'A125_Priest']) {
      for (let guard = 0; guard < 3 && response.interaction.stateId === 'wait'
        && !sessionOptions(response).some((entry) => entry.value === occupationId); guard += 1) {
        const enter = sessionOptions(response).find((entry) => entry.value !== '__skip__')
        expect(enter, JSON.stringify(response.interaction)).toBeDefined()
        response = session.resolveChoice(response.interaction.playerIndex, enter!.value)
      }
      if (response.interaction.stateId === 'wait') {
        const card = sessionOptions(response).find((entry) => entry.value === occupationId)
        expect(card, JSON.stringify(response.interaction)).toBeDefined()
        response = session.resolveChoice(response.interaction.playerIndex, card!.value)
      }
    }

    expect(response.state.players[0]!.occupationPlayed).toEqual(expect.arrayContaining([
      'A131_CraftTeacher', 'A116_WoodCutter', 'A125_Priest',
    ]))
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
})

describe("A131 command boundaries", () => {
  const CRAFT = 'A131_CraftTeacher'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 3 }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 10, clay: 10, reed: 10, stone: 10, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [CRAFT] : []
        state.players[0]!.occupationHand = played ? ['A110_Roughcaster', 'A114_SeasonalWorker', 'A119_FirewoodCollector'] : [CRAFT, 'A110_Roughcaster']
        configure(state)
      } }))
    return s
  }
  function choice(s: GameSession, r: SessionResponse, value: string) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    assert.ok(getChoiceOptions(r).some(o => o.value === value && !('disabled' in o && o.disabled)))
    return ok(s.resolveChoice(r.interaction.playerIndex, value))
  }
  function buyMajor(s: GameSession, card: string) {
    let r = ok(s.takeAction(0, 'major-improvement'))
    for (let n = 0; n < 8 && !r.state.players[0]!.improvements.includes(card); n++) {
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
      const o = getChoiceOptions(r).find(o => o.value === card || o.value === `major:${card}`) ?? getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'))
      assert.ok(o, JSON.stringify(r.interaction))
      r = choice(s, r, o.value)
    }
    return r
  }
  function teach(s: GameSession, r: SessionResponse, cards: string[]) {
    const submitted = new Set<string>()
    for (let n = 0; n < 12 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      assert.equal(r.interaction.request.kind, 'choice')
      assert.ok(r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
      sessionEvidence.record(`A131-teach-${n}`, r)
      const options = getChoiceOptions(r)
      const target = cards.find(id => !submitted.has(id) && !r.state.players[0]!.occupationPlayed.includes(id))
      const o = options.find(o => target === o.value) ?? (cards.length > 1 ? options.find(o => 'descriptionPreview' in o && o.descriptionPreview?.kind === 'group' && o.descriptionPreview.operator === 'sequence') : undefined) ?? options.find(o => !target ? (o.value === '__skip__' || o.value === '__done__') : o.value !== '__skip__' && o.value !== '__done__' && !('disabled' in o && o.disabled))
      assert.ok(o)
      if (r.interaction.promptKey === 'ui.interactionChooseOccupation' && cards.includes(o.value))
        submitted.add(o.value)
      r = ok(s.resolveChoice(r.interaction.playerIndex, o.value))
    }
    return r
  }
  it("each named workshop permits exactly two free occupations with zero food", () => {
    for (const major of ['Major_Joinery', 'Major_Pottery', 'Major_Basket']) {
      const s = setup(state => state.players[0]!.resources.food = 0)
      const pending = buyMajor(s, major)
      const r = teach(s, pending, ['A110_Roughcaster', 'A114_SeasonalWorker'])
      assert.ok(r.interaction.stateId === 'wait')
      assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      assert.deepEqual([...r.state.players[0]!.occupationPlayed].sort(), [CRAFT, 'A110_Roughcaster', 'A114_SeasonalWorker'].sort())
      assert.equal(r.state.players[0]!.resources.food, 0)
      assert.ok(r.state.players[0]!.occupationHand.includes('A119_FirewoodCollector'))
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'A119_FirewoodCollector'))

      sessionEvidence.record(`A131-N1-${major}`, { pending, r })
    }
  })
  it("declining all or after one free occupation preserves unused hand and food", () => {
    for (const cards of [[], ['A110_Roughcaster']]) {
      const s = setup(state => state.players[0]!.resources.food = 0)
      let r = buyMajor(s, 'Major_Joinery')
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
      assert.equal(r.interaction.sourceCard, CRAFT)
      assert.equal(r.interaction.promptKey, 'ui.interactionFlowSelect')
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      const workshopResources = structuredClone(r.state.players[0]!.resources)
      assert.deepEqual({ food: workshopResources.food, wood: workshopResources.wood, stone: workshopResources.stone }, { food: 0, wood: 8, stone: 8 })
      if (cards.length === 1) {
        const twoOccupations = getChoiceOptions(r).find(option => !option.disabled && option.descriptionPreview?.kind === 'group' && option.descriptionPreview.operator === 'sequence')
        assert.ok(twoOccupations)
        r = choice(s, r, twoOccupations.value)
        assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
        assert.equal(r.interaction.sourceCard, CRAFT)
        assert.equal(r.interaction.promptKey, 'ui.interactionChooseOccupation')
        assert.equal(r.interaction.playerIndex, 0)
        r = choice(s, r, 'A110_Roughcaster')
        sessionEvidence.record('A131-N2-second-optional', r)
        assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
        assert.equal(r.interaction.sourceCard, CRAFT)
        assert.equal(r.interaction.promptKey, 'ui.interactionOptionalAction')
        assert.equal(r.interaction.playerIndex, 0)
        assert.equal(r.state.currentPlayerIndex, 0)
      }
      const skip = getChoiceOptions(r).find(option => option.value === '__skip__' && !option.disabled)
      assert.ok(skip)
      r = choice(s, r, skip.value)
      assert.ok(r.interaction.stateId === 'wait')
      assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      assert.deepEqual(r.state.players[0]!.occupationPlayed, [CRAFT, ...cards])
      assert.deepEqual(r.state.players[0]!.occupationHand, cards.length === 0
        ? ['A110_Roughcaster', 'A114_SeasonalWorker', 'A119_FirewoodCollector']
        : ['A114_SeasonalWorker', 'A119_FirewoodCollector'])
      assert.deepEqual(r.state.players[0]!.resources, workshopResources)
      const played = r.state.events.filter(event => event.type === 'card.played')
      assert.deepEqual(played.map(event => ({ cardId: event.cardId, resourcesPaid: event.payment?.resources })), [
        { cardId: 'Major_Joinery', resourcesPaid: { wood: 2, stone: 2 } },
        ...(cards.length === 0 ? [] : [{ cardId: 'A110_Roughcaster', resourcesPaid: {} }]),
      ])
      assertRejectedUnchanged(s, () => s.resolveChoice(0, skip.value))
      sessionEvidence.record(`A131-N2-${cards.length}`, r)
    }
  })
  it("unrelated major and unplayed Teacher cannot grant occupations", () => {
    const s = setup()
    const unrelated = buyMajor(s, 'Major_Fireplace1')
    assert.ok(unrelated.interaction.stateId === 'wait')
    assert.deepEqual(unrelated.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(unrelated.interaction.playerIndex, 0)
    assert.equal(unrelated.state.currentPlayerIndex, 0)
    assert.equal(unrelated.state.players[0]!.occupationPlayed.length, 1)
    const hs = setup(undefined, false)
    const hand = buyMajor(hs, 'Major_Joinery')
    assert.ok(hand.interaction.stateId === 'wait')
    assert.deepEqual(hand.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(hand.interaction.playerIndex, 0)
    assert.equal(hand.state.currentPlayerIndex, 0)
    assert.equal(hand.state.players[0]!.occupationPlayed.length, 0)

    sessionEvidence.record('A131-N3', { unrelated, hand })
  })
  it("invalid occupation wrong actor and whole action undo restore workshop and free plays", () => {
    const s = setup(state => state.players[0]!.resources.food = 0)
    const beforeUndo = s.getState()
    const beforeRules = undoRuleSnapshot(beforeUndo)
    let pending = buyMajor(s, 'Major_Joinery')
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice')
    assert.equal(pending.interaction.sourceCard, CRAFT)
    const twoOccupations = getChoiceOptions(pending).find(option => !option.disabled && option.descriptionPreview?.kind === 'group' && option.descriptionPreview.operator === 'sequence')
    assert.ok(twoOccupations)
    pending = choice(s, pending, twoOccupations.value)
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice')
    assert.equal(pending.interaction.promptKey, 'ui.interactionChooseOccupation')
    const occupation = getChoiceOptions(pending).find(option => option.value === 'A110_Roughcaster' && !option.disabled)
    assert.ok(occupation)
    assertRejectedUnchanged(s, () => s.resolveChoice(1, occupation.value))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'A999_Nonexistent'))
    const first = teach(s, pending, ['A110_Roughcaster', 'A114_SeasonalWorker'])
    assert.ok(first.interaction.stateId === 'wait')
    assert.deepEqual(first.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(first.interaction.playerIndex, 0)
    assert.equal(first.state.currentPlayerIndex, 0)
    const undone = ok(s.undoAction())
    assertUndoRestored(beforeRules, undone)
    assert.deepEqual(undone.interaction, beforeUndo.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.deepEqual(undone.state.players[0]!.occupationPlayed, [CRAFT])
    assert.ok(!undone.state.players[0]!.improvements.includes('Major_Joinery'))
    const retry = teach(s, buyMajor(s, 'Major_Joinery'), ['A110_Roughcaster'])
    assert.ok(retry.interaction.stateId === 'wait')
    assert.deepEqual(retry.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(retry.interaction.playerIndex, 0)
    assert.equal(retry.state.currentPlayerIndex, 0)
    assert.equal(retry.state.players[0]!.occupationPlayed.length, 2)

    sessionEvidence.record('A131-N4', { first, undone, retry })
  })
})
