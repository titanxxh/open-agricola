import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { D95_SiteManager } from '../../shared/cards/D/D95_SiteManager'
import { occupations } from '../../shared/cards-display/_lookup'

import { setWorkersAtHome } from '../../shared/domain/player'
const CARD_ID = 'D95_SiteManager'

// Catalog registration is handled by the parent agent; for local testing we
// splice the card into the occupation registry if absent.
if (!occupations.some((c) => c.id === CARD_ID)) {
  occupations.push(D95_SiteManager)
}

describe('D95_SiteManager session', () => {
  // Deterministic setup: fixed seed + explicit non-card placeholder hands so the
  // dealt-hand randomness from `new GameSession()` never leaks into the test.
  // See the equivalent comment in `worker-identity-fg.test.ts` for the rationale.
  const FILLER = '__test_filler__'

  const setup = () => {
    const session = new GameSession(/* seed */ 1)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    for (const p of state.players) {
      p.minorHand = [FILLER]
      p.occupationHand = [FILLER]
    }

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = [CARD_ID, 'A85_Homekeeper']
    // Give 5 clay so Fireplace is affordable (2 clay cost) even without substitution
    player.resources = { ...player.resources, food: 10, wood: 0, clay: 5, stone: 0, reed: 0 }

    if (!state.availableMajorImprovements.includes('Major_Fireplace1')) {
      state.availableMajorImprovements.push('Major_Fireplace1')
    }
    session.loadState(state)
    return session
  }

  const playOccupation = (session: GameSession) => {
    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') return resp
    const opt = resp.interaction.options?.find((o) => o.value === CARD_ID)
    expect(opt).toBeDefined()
    return session.resolveChoice(0, opt!.value)
  }

  it('offers an optional major improvement purchase after playing', () => {
    const session = setup()
    let resp = playOccupation(session)
    expect(resp.state.players[0]!.occupationPlayed).toContain(CARD_ID)

    // The optional improvement is wrapped in an outer xor/optional, so the
    // first choice is "take flow" vs "skip". Drill into the inner improvement
    // choice and assert we see Fireplace1 as a major option.
    let steps = 0
    let foundFireplace = false
    while (resp.interaction.stateId === 'wait' && steps < 10) {
      steps++
      const options = resp.interaction.options ?? []
      if (options.some((o) => o.value === 'major:Major_Fireplace1')) {
        foundFireplace = true
        break
      }
      const nonSkip = options.find(
        (o) => o.value !== '__skip__' && o.value !== 'cancel',
      )
      if (nonSkip) {
        resp = session.resolveChoice(0, nonSkip.value)
      } else {
        break
      }
    }
    expect(foundFireplace).toBe(true)
  })

  it('substitutes food for lacking building resource via computeCosts', () => {
    const session = new GameSession(/* seed */ 1)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    for (const p of state.players) {
      p.minorHand = [FILLER]
      p.occupationHand = [FILLER]
    }
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = [CARD_ID, 'A85_Homekeeper']
    // 1 clay (lacking 1) + plenty of food. Greedy substitution will replace the
    // second clay unit with 1 food.
    player.resources = { ...player.resources, food: 10, clay: 1, wood: 0, stone: 0, reed: 0 }
    if (!state.availableMajorImprovements.includes('Major_Fireplace1')) {
      state.availableMajorImprovements.push('Major_Fireplace1')
    }
    session.loadState(state)
    let resp = playOccupation(session)

    // Walk until we find and pick Fireplace1
    let steps = 0
    let bought = false
    while (resp.interaction.stateId === 'wait' && steps < 12) {
      steps++
      const options = resp.interaction.options ?? []
      const fireplace = options.find(
        (o) => o.value === 'major:Major_Fireplace1' || o.value === 'Major_Fireplace1',
      )
      if (fireplace && !bought) {
        resp = session.resolveChoice(0, fireplace.value)
        bought = true
        continue
      }
      const next = options.find(
        (o) => o.value !== '__skip__' && o.value !== 'cancel',
      )
      if (next) {
        resp = session.resolveChoice(0, next.value)
      } else {
        break
      }
    }

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Fireplace1')
    // Base cost 2 clay. Player had 1 clay → substituted 1 clay with 1 food.
    expect(after.resources.clay).toBe(0)
    expect(after.resources.food).toBe(9) // 10 - 1 food substitution
  })

  it('prompts a multi-option payment choice when both direct and bonus paths are affordable', () => {
    // BGA-aligned behaviour: with four independent optional bonuses the
    // player must pick whether to swap wood/stone/both with food. Joinery
    // costs { wood: 2, stone: 2 }; player stocks enough of everything so
    // the skip-all, swap-wood, swap-stone, and swap-both paths are all
    // Pareto-incomparable and must be offered explicitly.
    const session = new GameSession(/* seed */ 1)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    for (const p of state.players) {
      p.minorHand = [FILLER]
      p.occupationHand = [FILLER]
    }
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = [CARD_ID, 'A85_Homekeeper']
    player.resources = {
      ...player.resources,
      food: 5, wood: 2, clay: 0, stone: 2, reed: 0,
    }
    if (!state.availableMajorImprovements.includes('Major_Joinery')) {
      state.availableMajorImprovements.push('Major_Joinery')
    }
    session.loadState(state)

    let resp = playOccupation(session)
    // Walk into the improvement flow and pick Joinery, stop at the payment prompt.
    let steps = 0
    let sawPaymentPrompt = false
    while (resp.interaction.stateId === 'wait' && steps < 12) {
      steps++
      if (resp.interaction.promptKey === 'prompt.selectPayment') {
        sawPaymentPrompt = true
        break
      }
      const options = resp.interaction.options ?? []
      const joinery = options.find(
        (o) => o.value === 'major:Major_Joinery' || o.value === 'Major_Joinery',
      )
      if (joinery) {
        resp = session.resolveChoice(0, joinery.value)
        continue
      }
      const next = options.find(
        (o) => o.value !== '__skip__' && o.value !== 'cancel',
      )
      if (!next) break
      resp = session.resolveChoice(0, next.value)
    }

    expect(sawPaymentPrompt).toBe(true)
    if (resp.interaction.stateId !== 'wait') return
    const paymentOptions = resp.interaction.options ?? []
    expect(paymentOptions.length).toBeGreaterThanOrEqual(2)

    type PaymentLabel = {
      resourcesPaid?: Record<string, number>
      sourceCards?: string[]
    }
    const labels = paymentOptions.map(
      (opt) => opt.labelParams as PaymentLabel | undefined,
    )
    const skipPath = labels.find(
      (l) => (l?.resourcesPaid?.wood ?? 0) === 2
        && (l?.resourcesPaid?.stone ?? 0) === 2
        && (l?.resourcesPaid?.food ?? 0) === 0,
    )
    const swapWoodPath = labels.find(
      (l) => (l?.resourcesPaid?.wood ?? 0) === 1
        && (l?.resourcesPaid?.stone ?? 0) === 2
        && (l?.resourcesPaid?.food ?? 0) === 1,
    )
    const swapStonePath = labels.find(
      (l) => (l?.resourcesPaid?.wood ?? 0) === 2
        && (l?.resourcesPaid?.stone ?? 0) === 1
        && (l?.resourcesPaid?.food ?? 0) === 1,
    )
    expect(skipPath).toBeDefined()
    expect(swapWoodPath).toBeDefined()
    expect(swapStonePath).toBeDefined()
    expect(skipPath?.sourceCards ?? []).toEqual([])
    expect(swapWoodPath?.sourceCards).toContain(CARD_ID)
    expect(swapStonePath?.sourceCards).toContain(CARD_ID)
  })

  it('does not substitute when player has all needed resources', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.clay = 5
    player.resources.food = 10
    session.loadState(state)

    let resp = playOccupation(session)
    // Player has enough clay for Fireplace (2) → no food substitution.
    let steps = 0
    let bought = false
    while (resp.interaction.stateId === 'wait' && steps < 12) {
      steps++
      const options = resp.interaction.options ?? []
      const fireplace = options.find(
        (o) => o.value === 'major:Major_Fireplace1' || o.value === 'Major_Fireplace1',
      )
      if (fireplace && !bought) {
        resp = session.resolveChoice(0, fireplace.value)
        bought = true
        continue
      }
      const next = options.find(
        (o) => o.value !== '__skip__' && o.value !== 'cancel',
      )
      if (next) {
        resp = session.resolveChoice(0, next.value)
      } else {
        break
      }
    }

    const p = resp.state.players[0]!
    expect(p.improvements).toContain('Major_Fireplace1')
    // Full clay cost paid; food untouched.
    expect(p.resources.food).toBe(10)
    expect(p.resources.clay).toBe(3) // 5 - 2
  })

  it('emits log.playOccupation for the card itself AND log.playImprovement for the bought major', () => {
    const session = new GameSession(/* seed */ 1)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    for (const p of state.players) {
      p.minorHand = [FILLER]
      p.occupationHand = [FILLER]
    }
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = [CARD_ID, 'A85_Homekeeper']
    // 1 clay + food → Fireplace (cost 2 clay) forces D95 substitution.
    player.resources = { ...player.resources, food: 10, clay: 1, wood: 0, stone: 0, reed: 0 }
    if (!state.availableMajorImprovements.includes('Major_Fireplace1')) {
      state.availableMajorImprovements.push('Major_Fireplace1')
    }
    session.loadState(state)

    let resp = playOccupation(session)
    // Drive through the optional improvement-any flow to the end.
    let steps = 0
    let bought = false
    while (resp.interaction.stateId === 'wait' && steps < 12) {
      steps++
      const options = resp.interaction.options ?? []
      const fireplace = options.find(
        (o) => o.value === 'major:Major_Fireplace1' || o.value === 'Major_Fireplace1',
      )
      if (fireplace && !bought) {
        resp = session.resolveChoice(0, fireplace.value)
        bought = true
        continue
      }
      const next = options.find((o) => o.value !== '__skip__' && o.value !== 'cancel')
      if (!next) break
      resp = session.resolveChoice(0, next.value)
    }

    const log = resp.state.log
    type PlayOccupationParams = { occupations?: string; bonusSources?: string[] }
    type PlayImprovementParams = { improvements?: string; bonusSources?: string[] }
    const occEntry = log.find((e) => e.key === 'log.playOccupation')
    const impEntry = log.find((e) => e.key === 'log.playImprovement')
    expect(occEntry).toBeDefined()
    expect((occEntry!.params as PlayOccupationParams | undefined)?.occupations).toContain(CARD_ID)
    expect(impEntry).toBeDefined()
    expect((impEntry!.params as PlayImprovementParams | undefined)?.improvements).toContain('Major_Fireplace1')
    // D95's bonus fired during the improvement payment, so its attribution
    // rides the scratchpad that is still populated when logImprovementDelta
    // runs.
    expect((impEntry!.params as PlayImprovementParams | undefined)?.bonusSources).toContain(CARD_ID)
  })

  it('keeps occupation log cost scoped to the occupation step when a later improvement also spends resources', () => {
    const session = new GameSession(/* seed */ 1)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    for (const p of state.players) {
      p.minorHand = [FILLER]
      p.occupationHand = [FILLER]
    }
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = [CARD_ID]
    player.occupationPlayed = ['A85_Homekeeper']
    // Second occupation on Lessons costs 1 food. The follow-up Fireplace buy
    // spends 1 clay + 1 food via D95, and must not leak into log.playOccupation.
    player.resources = { ...player.resources, food: 10, clay: 1, wood: 0, stone: 0, reed: 0 }
    if (!state.availableMajorImprovements.includes('Major_Fireplace1')) {
      state.availableMajorImprovements.push('Major_Fireplace1')
    }
    session.loadState(state)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') return
    resp = session.resolveChoice(0, CARD_ID)

    let steps = 0
    let bought = false
    while (resp.interaction.stateId === 'wait' && steps < 12) {
      steps++
      const options = resp.interaction.options ?? []
      const fireplace = options.find(
        (o) => o.value === 'major:Major_Fireplace1' || o.value === 'Major_Fireplace1',
      )
      if (fireplace && !bought) {
        resp = session.resolveChoice(0, fireplace.value)
        bought = true
        continue
      }
      const next = options.find((o) => o.value !== '__skip__' && o.value !== 'cancel')
      if (!next) break
      resp = session.resolveChoice(0, next.value)
    }

    type PlayOccupationParams = {
      occupations?: string
      costResources?: Record<string, number>
      bonusSources?: string[]
    }
    const occEntry = resp.state.log.find((e) => e.key === 'log.playOccupation')
    expect(occEntry).toBeDefined()
    expect((occEntry!.params as PlayOccupationParams | undefined)?.occupations).toContain(CARD_ID)
    expect((occEntry!.params as PlayOccupationParams | undefined)?.costResources).toEqual({ food: 1 })
    expect((occEntry!.params as PlayOccupationParams | undefined)?.bonusSources).toBeUndefined()
  })
})
