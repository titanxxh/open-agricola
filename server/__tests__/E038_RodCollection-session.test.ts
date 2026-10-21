import { describe, expect, it, onTestFinished, afterEach } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { resourceOptions, setupResourceAction } from './_helpers/batch07-resource-ownership'
import { createWorkSession } from './_helpers/session-fixtures'
import { bonusScore, playImprovement } from './_helpers/card-play-lifecycle'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/E/E038_RodCollection'
import assert from 'node:assert/strict'
import { assertRuleOutcome, assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit35Education from './_helpers/audit/ae-negative-35-education'
import { getChoiceOptions } from './_helpers/session-assertions'
import { expectCardEffectBeforeHostCollect } from './_helpers/space-use-order'

const CARD_ID = 'E038_RodCollection'

const rodSession = (woodCount?: number) => {
  const session = createWorkSession({
    seed: 38052,
    configure: state => {
      state.round = 5
      state.players.forEach(player => { player.resources.food = 100 })
      const player = state.players[0]!
      player.resources.wood = 16
      player.occupationPlayed = ['A110_Roughcaster', 'A125_Priest', 'C123_Freemason']
      if (woodCount === undefined) player.minorHand = [CARD_ID]
      else {
        player.minorPlayed = [CARD_ID]
        player.cardStates[CARD_ID] = { extraData: { woodCount } }
      }
    },
  })
  onTestFinished(() => session.dispose())
  return session
}

const reachOwnerTurn = (session: GameSession, round: number): SessionResponse => {
  for (let step = 0; step < 100; step++) {
    const response = session.getState()
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait') {
      const { request, playerIndex } = response.interaction
      if (request.kind === 'confirm-next-player') confirmNextPlayer(session)
      else if (request.kind === 'confirm-player-switch') confirmPlayerSwitch(session)
      else if (request.kind === 'feed') session.resolveChoice(playerIndex, 'confirm', { selections: [] })
      else throw new Error(`Unexpected round interaction: ${JSON.stringify(response.interaction)}`)
      continue
    }
    if (response.state.round === round && response.state.currentPlayerIndex === 0) return response
    expect(response.state.round).toBeLessThanOrEqual(round)
    const actor = response.state.currentPlayerIndex
    const space = ['grain-seeds', 'day-laborer', 'reed-bank', 'forest']
      .find(id => session.getActionAvailability(actor)[id])
    if (!space) throw new Error('Expected an available basic action')
    const advanced = session.takeAction(actor, space)
    expect(advanced.ok, advanced.error).toBe(true)
  }
  throw new Error(`Did not reach player zero in round ${round}`)
}

describe('E038 Rod Collection through Session', () => {
  it.each([0, 1, 2])('commits the selected %i wood from supply onto the card', (wood) => {
    const session = setupResourceAction('E038_RodCollection', 'fishing')
    session.state.players[0]!.resources.wood = 2
    session.state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = 1
    session.loadState(session.state)
    let response = resolveTriggerIfPresent(session, session.takeAction(0, 'fishing'), 'E038_RodCollection')
    const choice = wood === 0
      ? resourceOptions(response).find((option) => option.value === '__skip__')
      : resourceOptions(response).find((option) => option.effectPreview?.resourcesPaid?.wood === wood)
    expect(choice, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, choice!.value)
    expect(response.state.players[0]!.resources.wood).toBe(2 - wood)
    expect(readCardExtraData<number>(response.state.players[0]!, 'E038_RodCollection', 'woodCount') ?? 0).toBe(wood)
  })

  it('hides unaffordable choices and atomically rejects a forged choice before a legal retry', () => {
    const session = setupResourceAction('E038_RodCollection', 'fishing')
    session.state.players[0]!.resources.wood = 1
    session.state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 1
    session.loadState(session.state)
    const offered = resolveTriggerIfPresent(session, session.takeAction(0, 'fishing'), 'E038_RodCollection')
    expect(resourceOptions(offered).some((option) => option.effectPreview?.resourcesPaid?.wood === 2)).toBe(false)
    const before = JSON.stringify({ player: offered.state.players[0], interaction: offered.interaction })
    const rejected = session.resolveChoice(0, 'forged-two-wood')
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify({ player: rejected.state.players[0], interaction: rejected.interaction })).toBe(before)
    const one = resourceOptions(rejected).find((option) => option.effectPreview?.resourcesPaid?.wood === 1)!
    const resolved = session.resolveChoice(0, one.value)
    expect(resolved.ok, resolved.error).toBe(true)
    expect(resolved.state.players[0]!.resources.wood).toBe(0)
    expect(readCardExtraData<number>(resolved.state.players[0]!, 'E038_RodCollection', 'woodCount')).toBe(1)
  })

  it.each([
    [0, 0], [1, 1], [3, 2], [4, 3], [6, 4], [7, 5],
    [9, 6], [10, 7], [12, 9], [13, 10], [15, 12],
  ])('storing one wood after %i stored wood yields %i bonus points', (stored, expected) => {
    const session = rodSession(stored)
    const offered = resolveTriggerIfPresent(session, session.takeAction(0, 'fishing'), CARD_ID)
    const oneWood = resourceOptions(offered).find(option => option.effectPreview?.resourcesPaid?.wood === 1)
    if (!oneWood) throw new Error('Expected one-wood storage choice')
    const response = session.resolveChoice(0, oneWood.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(15)
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'woodCount')).toBe(stored + 1)
    expect(bonusScore(response, CARD_ID)).toBe(expected)
    expect(response.scores[0]!.categories.find(category => category.key === 'cards')?.entries)
      .toContainEqual({ type: 'card', cardId: CARD_ID, cardType: 'minor', score: 1 })
  })

  it('buys the card and reaches thirteen stored wood through seven natural Fishing uses', () => {
    const session = rodSession()
    const bought = playImprovement(session, CARD_ID, 'meeting-place')
    expect(bought.state.players[0]!.minorPlayed).toContain(CARD_ID)
    const steps = [
      { round: 5, wood: 2, stored: 2, bonus: 1 },
      { round: 6, wood: 2, stored: 4, bonus: 2 },
      { round: 7, wood: 2, stored: 6, bonus: 4 },
      { round: 8, wood: 2, stored: 8, bonus: 5 },
      { round: 9, wood: 2, stored: 10, bonus: 6 },
      { round: 10, wood: 2, stored: 12, bonus: 8 },
      { round: 11, wood: 1, stored: 13, bonus: 9 },
    ]
    for (const step of steps) {
      const before = reachOwnerTurn(session, step.round)
      const woodBefore = before.state.players[0]!.resources.wood
      const offered = resolveTriggerIfPresent(session, session.takeAction(0, 'fishing'), CARD_ID)
      const option = resourceOptions(offered).find(choice => choice.effectPreview?.resourcesPaid?.wood === step.wood)
      if (!option) throw new Error(`Expected ${step.wood}-wood storage choice`)
      const response = session.resolveChoice(0, option.value)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.wood).toBe(woodBefore - step.wood)
      expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'woodCount')).toBe(step.stored)
      expect(bonusScore(response, CARD_ID)).toBe(step.bonus)
      expect(response.state.events).toContainEqual(expect.objectContaining({
        type: 'resource.paid', sourceCardId: CARD_ID, resources: { wood: step.wood },
      }))
    }
  })
})

describe('ae-negative-35-education', () => {
  const { sessions, save, ok, choose, pendingCard, trigger, finish, ready, action, buy, accept, bonus, printed, advanceRod, rod, putWood, rodWood } = audit35Education
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E038 N1 actual three occupation purchase and Fishing store two wood irretrievably after rejecting a third wood payment', () => { const s = rod(), bought = finish(s, buy(s, 'E038_RodCollection')), opponent = action(s, 1, 'forest'); ready(s); const p = finish(s, ok(s.takeAction(0, 'fishing')), 'E038_RodCollection'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'three-wood')), r = putWood(s, p, 2); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(rodWood(r), 2); assert.equal(bonus(r, 'E038_RodCollection'), 1); assert.equal(printed(r, 'E038_RodCollection'), 1); const t = rod(false, 2, 2), poor = buy(t, 'E038_RodCollection'); assertRejectedUnchanged(t, () => t.resolveChoice(0, 'E038_RodCollection')); assert.ok(poor.state.players[0]!.minorHand.includes('E038_RodCollection')); save('E038-N1', { bought, opponent, p, bad, r, poor }); });
  it('E038 N2 optional decline no wood held card and real opponent Fishing cannot store owner wood or create bonus points', () => {
      const s = rod(true), p = trigger(s, finish(s, ok(s.takeAction(0, 'fishing')), 'E038_RodCollection'), 'E038_RodCollection'), decline = finish(s, choose(s, p, o => o.value === '__skip__'));
      assert.deepEqual([decline.state.players[0]!.resources.wood, rodWood(decline), bonus(decline, 'E038_RodCollection')], [2, 0, 0]);
      const rows = [];
      for (const [played, wood] of [[true, 0], [false, 2]] as const) {
          const t = rod(played, wood), q = finish(t, ok(t.takeAction(0, 'fishing')), 'E038_RodCollection'), r = finish(t, pendingCard(q, 'E038_RodCollection') ? accept(t, q, 'E038_RodCollection') : q);
          assert.equal(rodWood(r), 0);
          assert.equal(bonus(r, 'E038_RodCollection'), 0);
          rows.push({ q, r });
      }
      const u = rod(true), first = action(u, 0, 'reed-bank'), opponent = action(u, 1, 'fishing');
      assert.equal(rodWood(opponent), 0);
      assert.equal(opponent.state.players[0]!.resources.wood, 2);
      save('E038-N2', { p, decline, rows, first, opponent });
  });
  it('E038 N3 seven real Fishing uses store thirteen wood and only printed positions one four seven ten lose their bonus point', () => {
      const s = rod(false, 13), bought = finish(s, buy(s, 'E038_RodCollection')), opponent = action(s, 1, 'reed-bank');
      ready(s);
      const rows = [];
      for (const [round, n, expectedWood, expectedBonus] of [[5, 2, 2, 1], [6, 2, 4, 2], [7, 2, 6, 4], [8, 2, 8, 5], [9, 2, 10, 6], [10, 2, 12, 8], [11, 1, 13, 9]] as const) {
          if (round > 5)
              advanceRod(s, round);
          const p = finish(s, ok(s.takeAction(0, 'fishing')), 'E038_RodCollection'), r = putWood(s, p, n);
          assert.equal(rodWood(r), expectedWood);
          save('E038-N3-step-' + round, { p, r });
          rows.push({ p, r });
          if (round < 11)
              assert.equal(bonus(r, 'E038_RodCollection'), expectedBonus);
      }
      const last = rows[rows.length - 1]!.r;
      save('E038-N3', { bought, opponent, rows });
      assertRuleOutcome({ stored: rodWood(last), bonus: bonus(last, 'E038_RodCollection') }, { stored: 13, bonus: 9 });
  });
})

describe('E038 before timing (#1322)', () => {
  const make = (actor: number) => {
    const session = createWorkSession({ seed: 1322038, configure: state => {
      state.round = 14
      state.currentPlayerIndex = actor
      state.players.forEach(player => Object.assign(player.resources, { food: 5, wood: 2 }))
      state.players[0]!.minorPlayed = [CARD_ID]
      state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 2
    } })
    onTestFinished(() => session.dispose())
    return session
  }

  it('stores wood while the Fishing food is still on the space', () => {
    const session = make(0)
    const offered = session.takeAction(0, 'fishing')

    expect(offered.ok, offered.error).toBe(true)
    const woodPaid = (preview: unknown) => (preview as { resourcesPaid?: { wood?: number } } | undefined)?.resourcesPaid?.wood
    const twoWood = getChoiceOptions(offered).find(option => woodPaid(option.effectPreview) === 2)
    expect(twoWood, JSON.stringify(offered.interaction)).toBeDefined()
    expect(offered.state.players[0]!.resources.food).toBe(5)
    expect(offered.state.actionSpaces.find(space => space.id === 'fishing')!.resources.food).toBe(2)

    const response = session.resolveChoice(0, twoWood!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 7, wood: 0 })
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'woodCount')).toBe(2)
    expectCardEffectBeforeHostCollect(response, { cardId: CARD_ID, spaceId: 'fishing', type: 'resource.paid' })
  })

  it('does not offer the owner card when an opponent uses Fishing', () => {
    const response = make(1).takeAction(1, 'fishing')

    expect(response.ok, response.error).toBe(true)
    expect(getChoiceOptions(response).some(option => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.state.players[1]!.resources).toMatchObject({ food: 7, wood: 2 })
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })
})
