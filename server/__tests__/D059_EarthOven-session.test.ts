import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A031_DebtSecurity'
import '../../shared/cards/A/A060_OrientalFireplace'
import '../../shared/cards/D/D059_EarthOven'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit38Cooking from './_helpers/audit/ae-negative-38-cooking'

const CARD_ID = 'D059_EarthOven'
const FIREPLACE_ID = 'Major_Fireplace1'
const ORIENTAL_FIREPLACE_ID = 'A060_OrientalFireplace'
const DEBT_SECURITY_ID = 'A031_DebtSecurity'
const FILLER = '__test_placeholder__'

const setupPurchase = (returnCard: string | null = FIREPLACE_ID) => {
  const session = new GameSession(6059, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID, FILLER]
  if (returnCard === ORIENTAL_FIREPLACE_ID) player.minorPlayed = [returnCard]
  else if (returnCard) player.improvements = [returnCard]
  state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy = []
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'major-improvement')
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const play = (session: GameSession): SessionResponse => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((candidate) => candidate.value === CARD_ID) ?? false)

const setupPlayed = (resources: Partial<{
  vegetable: number
  sheep: number
  boar: number
  cattle: number
  grain: number
}> = {}) => {
  const session = new GameSession(7059, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 3
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const player = state.players[0]!
  player.minorPlayed = [CARD_ID]
  Object.assign(player.resources, resources)
  state.actionSpaces.find((space) => space.id === 'farmland')!.takenBy = []
  state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy = []
  session.loadState(state)
  return session
}

describe('D059 Earth Oven parity', () => {
  it('D059 S1: returning a Fireplace plays Earth Oven without resources', () => {
    const response = play(setupPurchase())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.improvements).not.toContain(FIREPLACE_ID)
    expect(response.state.availableMajorImprovements).toContain(FIREPLACE_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0,
    })
  })

  it('D059 S2: without a returnable Fireplace Earth Oven is unavailable', () => {
    const response = enterMinor(setupPurchase(null))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
  })

  it('D059 S3: Oriental Fireplace can be returned to play Earth Oven', () => {
    const response = play(setupPurchase(ORIENTAL_FIREPLACE_ID))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(ORIENTAL_FIREPLACE_ID)
    expect(response.state.availableMajorImprovements).not.toContain(ORIENTAL_FIREPLACE_ID)
  })

  it.each([
    ['vegetable', 3],
    ['sheep', 2],
    ['boar', 3],
    ['cattle', 3],
  ] as const)('D059 S4: anytime exchange converts one %s into %i food', (resource, food) => {
    const session = setupPlayed({ [resource]: 1 })
    expect(session.takeAction(0, 'farmland').ok).toBe(true)

    let response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    const index = { vegetable: 0, sheep: 1, boar: 2, cattle: 3 }[resource]
    expect(response.interaction.stateId === 'wait'
      && response.interaction.request.options?.some((candidate) =>
        candidate.value === `trade:${index}:1`)).toBe(true)
    response = session.resolveChoice(0, `bulk:${index}=1`)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources[resource]).toBe(0)
    expect(response.state.players[0]!.resources.food).toBe(food)
  })

  it('D059 S5: grain is excluded from anytime cooking and bakes for two food per grain', () => {
    const session = setupPlayed({ grain: 2 })
    const active = session.takeAction(0, 'farmland')
    expect(active.ok, active.error).toBe(true)
    expect(active.interaction.anytimeActions.map((action) => action.id)).not.toContain('exchange')

    const bakeSession = setupPlayed({ grain: 2 })
    let response = bakeSession.takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const bakeOptions = response.interaction.request.options?.map((option) => option.value) ?? []
    expect(bakeOptions).toContain(`count-${CARD_ID}-2`)
    response = bakeSession.resolveChoice(0, `count-${CARD_ID}-2`)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 4 })
  })

  it('D059 S6: Earth Oven counts as one major improvement for another card effect', () => {
    const session = setupPlayed()
    const state = session.getState().state
    state.players[0]!.minorPlayed.push(DEBT_SECURITY_ID)
    session.loadState(state)

    const entry = session.getState().scores[0]!.categories
      .find((category) => category.key === 'cardBonusVp')
      ?.entries.find((candidate) => candidate.cardId === DEBT_SECURITY_ID)
    expect(entry?.score).toBe(1)
  })

  it('D059 S7: Earth Oven contributes its printed three points at scoring', () => {
    const response = setupPlayed().getState()

    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 3 }))
  })
})

describe('ae-negative-38-cooking', () => {
  const { sessions, save, ok, options, ready, action, buy, bonus, printed, cook, earth, returned, bake } = audit38Cooking
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D059 N1 actual return of either Fireplace or Oriental Fireplace plays Earth Oven with three printed points and exactly one major for Debt Security', () => {
      const rows = [];
      for (const card of ['Major_Fireplace1', 'Major_Fireplace2', 'A060_OrientalFireplace'] as const) {
          const s = earth(card), p = buy(s, 'D059_EarthOven'), r = returned(s, p, card);
          save('D059-N1-r-' + card, r);
          assert.ok(r.state.players[0]!.minorPlayed.includes('D059_EarthOven'));
          assert.equal(r.state.players[0]!.improvements.includes(card) || r.state.players[0]!.minorPlayed.includes(card), false);
          assert.equal(printed(r, 'D059_EarthOven'), 3);
          assert.equal(bonus(r, 'A031_DebtSecurity'), 1);
          if (card.startsWith('Major'))
              assert.ok(r.state.availableMajorImprovements.includes(card));
          rows.push({ p, r });
      }
      save('D059-N1', rows);
  });
  it('D059 N2 actual purchase followed by native anytime cooking applies all four literal food rates and excludes Earth Oven grain from anytime', () => {
      const rows = [];
      for (const [type, food] of [['vegetable', 103], ['sheep', 102], ['boar', 103], ['cattle', 103]] as const) {
          const s = earth('Major_Fireplace1', type), bought = returned(s, buy(s, 'D059_EarthOven'), 'Major_Fireplace1'), opponent = action(s, 1, 'reed-bank');
          ready(s);
          const r = cook(s, type, 1, 'D059_EarthOven');
          assert.deepEqual([r.state.players[0]!.resources[type], r.state.players[0]!.resources.food], [0, food]);
          rows.push({ bought, opponent, r });
      }
      const q = earth(), bought = returned(q, buy(q, 'D059_EarthOven'), 'Major_Fireplace1'), opponent = action(q, 1, 'reed-bank');
      ready(q);
      const p = ok(q.takeAnytimeAction(0, 'exchange'));
      assert.equal(options(p).some(o => o.value.includes('D059_EarthOven') && o.effectPreview && 'resourcesPaid' in o.effectPreview && (o.effectPreview.resourcesPaid?.grain ?? 0) > 0), false);
      save('D059-N2', { rows, bought, opponent, p });
  });
  it('D059 N3 actual returned Fireplace permits two grain Bake Bread for four food while no Fireplace or a Cooking Hearth alone cannot buy', () => {
      const s = earth(), bought = returned(s, buy(s, 'D059_EarthOven'), 'Major_Fireplace1'), opponent = action(s, 1, 'reed-bank');
      ready(s);
      const r = bake(s, 2, 'D059_EarthOven');
      assert.deepEqual([r.state.players[0]!.resources.grain, r.state.players[0]!.resources.food], [0, 104]);
      const rows = [];
      for (const card of ['', 'Major_CookingHearth1'] as const) {
          const t = earth(card), p = buy(t, 'D059_EarthOven'), bad = assertRejectedUnchanged(t, () => t.resolveChoice(0, 'D059_EarthOven'));
          assert.ok(p.state.players[0]!.minorHand.includes('D059_EarthOven'));
          rows.push({ p, bad });
      }
      save('D059-N3', { bought, opponent, r, rows });
  });
})
