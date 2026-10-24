import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import type { GameState, PaymentResourceMap } from '../../shared/contract/types'
import { emptyResources, type InitialStateOptions } from '../../shared/session/state-bootstrap'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import '../../shared/cards/C/C122_Bricklayer'
import '../../shared/cards/E/E109_BraidMaker'
import '../../shared/cards/D/D095_SiteManager'
import '../../shared/cards/M/M093_FarmhandsQuarters'
import '../../shared/cards/E/E027_PiggyBank'

const sessions: GameSession[] = []
afterEach(() => { sessions.splice(0).forEach(session => session.dispose()) })

const autumnSession = (configure?: (state: GameState) => void, options?: InitialStateOptions) => {
  const session = createWorkSession({
    seed: 1375,
    options: { enableThroughTheSeasons: true, ...options },
    configure: state => {
      state.round = 7
      state.throughTheSeasons = { startSeason: 'autumn', currentSeason: 'autumn' }
      state.availableMajorImprovements = ['Major_Fireplace1']
      state.players.forEach(player => {
        player.resources = { ...emptyResources }
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
      })
      state.players[0]!.resources.clay = 2
      configure?.(state)
    },
  })
  sessions.push(session)
  return session
}

const restore = (session: GameSession) => {
  const snapshot = serializeSessionSnapshot(session.state, session)
  const recovered = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
  sessions.push(recovered)
  expect(recovered.getState().interaction).toEqual(session.getState().interaction)
  expect(recovered.state.events).toEqual(session.state.events)
  expect(recovered.state.log).toEqual(session.state.log)
  expect(recovered.getState().scores).toEqual(session.getState().scores)
  return recovered
}

const purchaseEvent = (response: SessionResponse) => {
  const event = response.state.events.find(event => event.type === 'card.played' && event.cardType === 'major')
  if (event?.type !== 'card.played') throw new Error('Missing major purchase')
  return event
}

const finishPurchase = (session: GameSession, response: SessionResponse, paid?: PaymentResourceMap) => {
  for (let step = 0; step < 6; step++) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') return response
    const options = response.interaction.request.options
    const option = response.interaction.promptKey === 'prompt.selectPayment'
      ? options.find(entry => {
        const actual = entry.labelParams?.resourcesPaid
        if (!actual || typeof actual !== 'object') return false
        const expected = new Map(Object.entries(paid ?? {}))
        return Object.entries(actual).every(([key, value]) => value === (expected.get(key) ?? 0)) &&
          [...expected].every(([key, value]) => Object.entries(actual).some(([actualKey, amount]) => actualKey === key && amount === value))
      })
      : options.find(entry => entry.value === 'Major_Fireplace1') ??
        options.find(entry => entry.value !== '__skip__' && entry.value !== '__done__')
    if (!option) throw new Error(`Missing purchase choice: ${JSON.stringify(response.interaction)}`)
    response = session.resolveChoice(0, option.value)
  }
  throw new Error('Purchase did not finish')
}

describe('autumn major payment explanation', () => {
  it('records the actual autumn clay saving on the selected payment and owning purchase row', () => {
    const session = autumnSession()
    const other = structuredClone(session.state.players[1])
    const done = finishPurchase(session, session.takeAction(0, 'major-improvement'))
    expect(done.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(done.state.players[0]!.resources).toEqual({ ...emptyResources, clay: 1 })
    expect(done.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(done.state.players[1]).toEqual(other)
    const seasonalAdjustments = [{ season: 'autumn', resources: { clay: -1 } }]
    expect(done.state.events.filter(event => event.type === 'resource.paid')).toEqual([
      expect.objectContaining({ resources: { clay: 1 }, seasonalAdjustments }),
    ])
    expect(done.state.events.find(event => event.type === 'card.played')).toMatchObject({
      cardId: 'Major_Fireplace1', payment: { resources: { clay: 1 }, seasonalAdjustments },
    })
    expect(done.state.log.filter(entry => entry.key === 'log.playImprovement')).toEqual([
      expect.objectContaining({ params: expect.objectContaining({
        improvements: 'Major_Fireplace1', costResources: { clay: 1 }, seasonalAdjustments,
      }) }),
    ])
    expect(done.state.log.filter(entry => entry.key === 'log.cardEffectPay')).toHaveLength(0)
    expect(Object.keys(done.state.players[0]!.cardStates).some(id => id.startsWith('through-the-seasons:'))).toBe(false)
    expect(done.scores).toHaveLength(2)
  })

  it.each([
    { paid: { wood: 1, stone: 2 }, saved: { wood: -1 } },
    { paid: { wood: 2, stone: 1 }, saved: { stone: -1 } },
  ])('keeps only the chosen Joinery material saving for $paid', ({ paid, saved }) => {
    const session = autumnSession(state => {
      state.availableMajorImprovements = ['Major_Joinery']
      Object.assign(state.players[0]!.resources, { clay: 0, wood: 2, stone: 2 })
    })
    const done = finishPurchase(session, session.takeAction(0, 'major-improvement'), paid)
    expect(purchaseEvent(done).payment).toMatchObject({
      resources: paid, seasonalAdjustments: [{ season: 'autumn', resources: saved }],
    })
    expect(done.state.events.filter(event => event.type === 'resource.paid')).toHaveLength(1)
    expect(done.state.players[0]!.resources.wood).toBe(paid.wood === 1 ? 1 : 0)
    expect(done.state.players[0]!.resources.stone).toBe(paid.stone === 1 ? 1 : 0)
  })

  it('keeps a one-clay autumn saving when Bricklayer makes the final payment zero', () => {
    const session = autumnSession(state => {
      state.players[0]!.occupationPlayed = ['C122_Bricklayer']
      state.players[0]!.resources.clay = 0
    })
    const done = finishPurchase(session, session.takeAction(0, 'major-improvement'))
    const expected = { resources: {}, seasonalAdjustments: [{ season: 'autumn', resources: { clay: -1 } }] }
    expect(purchaseEvent(done).payment).toMatchObject(expected)
    expect(done.state.events.filter(event => event.type === 'resource.paid')).toEqual([expect.objectContaining(expected)])
    expect(done.state.log.find(entry => entry.key === 'log.playImprovement')?.params).toMatchObject({
      costResources: {}, seasonalAdjustments: expected.seasonalAdjustments,
    })
    expect(readCardResourceStats(done.state.players[0]!, 'C122_Bricklayer')?.saved).toEqual({ clay: 1 })
    expect(Object.keys(done.state.players[0]!.cardStates).some(id => id.startsWith('through-the-seasons:'))).toBe(false)
  })

  it.each([
    { paid: { stone: 1 }, saved: { reed: -1 } },
    { paid: { reed: 1 }, saved: { stone: -1 } },
  ])('explains only the selected fixed-price Basket candidate $paid', ({ paid, saved }) => {
    const session = autumnSession(state => {
      state.availableMajorImprovements = ['Major_Basket']
      state.players[0]!.occupationPlayed = ['E109_BraidMaker']
      state.players[0]!.resources = { ...emptyResources, reed: 2, stone: 2 }
    })
    const done = finishPurchase(session, session.takeAction(0, 'major-improvement'), paid)
    expect(purchaseEvent(done).payment).toMatchObject({
      resources: paid, seasonalAdjustments: [{ season: 'autumn', resources: saved }],
    })
    expect(purchaseEvent(done).payment?.bonusSources).toEqual(['E109_BraidMaker', 'through-the-seasons:autumn'])
  })

  it('preserves the candidate clay discount through Site Manager food replacement', () => {
    const session = autumnSession(state => {
      state.players[0]!.occupationHand = ['D095_SiteManager']
      state.players[0]!.resources = { ...emptyResources, food: 1 }
    })
    const done = finishPurchase(session, session.takeAction(0, 'lessons'), { food: 1 })
    expect(purchaseEvent(done).payment).toMatchObject({
      resources: { food: 1 }, seasonalAdjustments: [{ season: 'autumn', resources: { clay: -1 } }],
    })
    expect(done.state.players[0]!.resources).toEqual({ ...emptyResources })
    expect(done.state.players[0]!.occupationPlayed).toContain('D095_SiteManager')
  })

  it('preserves the candidate clay discount through Farmhands Quarters fuel replacement', () => {
    const session = autumnSession(state => {
      state.players[0]!.minorPlayed = ['M093_FarmhandsQuarters']
      state.players[0]!.resources = { ...emptyResources, fuel: 1 }
    }, { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true })
    const done = finishPurchase(session, session.takeAction(0, 'major-improvement'), { fuel: 1 })
    expect(purchaseEvent(done).payment).toMatchObject({
      resources: { fuel: 1 }, seasonalAdjustments: [{ season: 'autumn', resources: { clay: -1 } }],
    })
    expect(done.state.players[0]!.resources.fuel).toBe(0)
  })

  it('does not attach an overwritten autumn discount to Piggy Bank free-price candidate', () => {
    const session = autumnSession(state => {
      state.players[0]!.minorPlayed = ['E027_PiggyBank']
      state.players[0]!.cardStates.E027_PiggyBank = { flagged: true }
      state.players[0]!.resources.clay = 0
    })
    const done = finishPurchase(session, session.takeAction(0, 'major-improvement'))
    expect(purchaseEvent(done).payment?.resources).toEqual({})
    expect(purchaseEvent(done).payment?.seasonalAdjustments).toBeUndefined()
    expect(purchaseEvent(done).payment?.bonusSources).toEqual(['E027_PiggyBank'])
  })

  it.each(['winter', 'spring', 'summer', 'disabled'] as const)('does not claim an autumn saving in %s', mode => {
    const session = autumnSession(state => {
      if (mode === 'disabled') state.enableThroughTheSeasons = false
      else state.throughTheSeasons = { startSeason: mode, currentSeason: mode }
    })
    const done = finishPurchase(session, session.takeAction(0, 'major-improvement'))
    expect(purchaseEvent(done).payment?.resources).toEqual({ clay: 2 })
    expect(purchaseEvent(done).payment?.seasonalAdjustments).toBeUndefined()
    expect(done.state.log.find(entry => entry.key === 'log.playImprovement')?.params?.seasonalAdjustments).toBeUndefined()
  })

  it('does not claim an autumn saving on an ordinary minor purchase', () => {
    const session = autumnSession(state => {
      state.availableMajorImprovements = []
      state.players[0]!.minorHand = ['A067_CornScoop']
      state.players[0]!.resources = { ...emptyResources, wood: 1 }
    })
    const done = finishPurchase(session, session.takeAction(0, 'major-improvement'))
    expect(done.state.players[0]!.minorPlayed).toContain('A067_CornScoop')
    const played = done.state.events.find(event => event.type === 'card.played')
    expect(played?.type === 'card.played' && played.payment?.resources).toEqual({ wood: 1 })
    expect(played?.type === 'card.played' && played.payment?.seasonalAdjustments).toBeUndefined()
  })

  it('does not claim a building-material saving when returning a Fireplace', () => {
    const session = autumnSession(state => {
      state.availableMajorImprovements = ['Major_CookingHearth1']
      state.players[0]!.improvements = ['Major_Fireplace1']
      state.players[0]!.resources.clay = 0
    })
    const done = finishPurchase(session, session.takeAction(0, 'major-improvement'))
    expect(purchaseEvent(done).payment).toMatchObject({ resources: {}, returnedCardId: 'Major_Fireplace1' })
    expect(purchaseEvent(done).payment?.seasonalAdjustments).toBeUndefined()
  })

  it('restores the pending selected-material menu, rejects invalid choices, and undoes before one retry', () => {
    let session = autumnSession(state => {
      state.availableMajorImprovements = ['Major_Joinery']
      state.players[0]!.resources = { ...emptyResources, wood: 2, stone: 2 }
    })
    const before = undoRuleSnapshot(session.getState())
    let offered = session.takeAction(0, 'major-improvement')
    if (offered.interaction.promptKey !== 'prompt.selectPayment') {
      const option = offered.interaction.request.options.find(entry => entry.value !== '__skip__')
      if (!option) throw new Error('Missing improvement choice')
      offered = session.resolveChoice(0, option.value)
    }
    expect(offered.interaction.promptKey).toBe('prompt.selectPayment')
    session = restore(session)
    const invalid = session.getState().interaction.request.options.find(entry => entry.value !== 'cancel')
    if (!invalid) throw new Error('Missing payment')
    assertRejectedUnchanged(session, () => session.resolveChoice(1, invalid.value))
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'invalid-autumn-payment'))
    const done = finishPurchase(session, session.getState(), { wood: 2, stone: 1 })
    const payment = purchaseEvent(done).payment
    session = restore(session)
    assertUndoRestored(before, session.undoAction())
    expect(session.state.events.filter(event => event.type === 'resource.paid')).toHaveLength(0)
    const retry = finishPurchase(session, session.takeAction(0, 'major-improvement'), { wood: 2, stone: 1 })
    expect(purchaseEvent(retry).payment).toMatchObject({
      resources: payment?.resources, seasonalAdjustments: payment?.seasonalAdjustments,
    })
    expect(retry.state.events.filter(event => event.type === 'resource.paid')).toHaveLength(1)
    expect(retry.scores).toEqual(done.scores)
    expect(Object.keys(retry.state.players[0]!.cardStates).some(id => id.startsWith('through-the-seasons:'))).toBe(false)
  })
})
