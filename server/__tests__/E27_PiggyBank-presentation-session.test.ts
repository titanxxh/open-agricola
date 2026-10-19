import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { workersAvailable } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { createWorkSession } from './_helpers/session-fixtures'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { expectPublicCardGoods } from './_helpers/card-public-presentation'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions, passPreparationExchanges } from './_helpers/session-assertions'

const CARD_ID = 'E027_PiggyBank'
const ANYTIME_ID = 'E27-piggy-bank-anytime'
const { track, record } = createScenarioEvidence(import.meta.url)

const setup = ({ food = 1, stored = 5, played = true } = {}) => track(createWorkSession({
  seed: 1294,
  configure: state => {
    state.round = 1
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0 })
    }
    const owner = state.players[0]!
    owner.resources.food = food
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.minorHand = played ? ['__test_placeholder__'] : [CARD_ID]
    owner.cardStates[CARD_ID] = { counters: { food: stored }, infobox: 'stale' }
    for (const [id, resource] of [['forest', 'wood'], ['clay-pit', 'clay'], ['reed-bank', 'reed']] as const) {
      state.actionSpaces.find(space => space.id === id)!.resources[resource] = 1
    }
  },
}))

const ok = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  return response
}

const restore = (session: GameSession) => track(new GameSession(rehydrateState(
  JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session))),
)))

const choose = (session: GameSession, response: SessionResponse, value: string) => {
  const interaction = response.interaction
  if (interaction.stateId !== 'wait') throw new Error('Expected a waiting Piggy Bank decision')
  expect(getChoiceOptions(response).some(option => option.value === value && !option.disabled)).toBe(true)
  return ok(session.resolveChoice(interaction.playerIndex, value))
}

const chooseFirst = (session: GameSession, response: SessionResponse) => {
  const option = getChoiceOptions(response).find(candidate => !candidate.value.startsWith('__') && !candidate.disabled)
  if (!option) throw new Error(`Expected a Piggy Bank option: ${JSON.stringify(response.interaction)}`)
  return choose(session, response, option.value)
}

const reachWorkEnd = (session: GameSession) => {
  let response = ok(session.takeAction(0, 'grain-seeds'))
  for (const [player, space] of [[1, 'forest'], [0, 'clay-pit'], [1, 'reed-bank']] as const) {
    confirmNext(session, response)
    response = ok(session.takeAction(player, space))
  }
  return confirmNext(session, response)
}

const redeem = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.anytimeActions.map(action => action.id)).toContain(ANYTIME_ID)
  let next = ok(session.takeAnytimeAction(0, ANYTIME_ID))
  record('major-choice', next)
  next = choose(session, next, 'Major_Joinery')
  return passPreparationExchanges(session, next)
}

describe('E027 public presentation through work end, redemption and recovery', () => {
  it('stores the sixth food at real work end and derives every viewer presentation after restoration, redemption and undo', () => {
    let session = setup()
    expectPublicCardGoods(session, CARD_ID, { infobox: '5 / 6', counters: { food: 5 } })
    let response = reachWorkEnd(session)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).toBe(CARD_ID)
    expectPublicCardGoods(session, CARD_ID, { infobox: '5 / 6' })
    record('deposit-choice', response)
    session = restore(session)
    response = passPreparationExchanges(session, chooseFirst(session, session.getState()))
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.food).toBe(6)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.infobox).toBe('stale')
    expect(response.state.round).toBe(2)
    expectPublicCardGoods(session, CARD_ID, { infobox: '6 / 6', counters: { food: 6 } })
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.cardTriggered', params: expect.objectContaining({ cardId: CARD_ID }) }))

    session = restore(session)
    const before = ok(session.takeAction(0, 'grain-seeds'))
    const resources = { ...before.state.players[0]!.resources }
    const workers = workersAvailable(before.state, before.state.players[0]!)
    response = redeem(session, before)
    expect(response.state.players[0]!.resources).toEqual(resources)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(workers)
    expect(response.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(response.state.availableMajorImprovements).not.toContain('Major_Joinery')
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.food).toBe(0)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(false)
    expectPublicCardGoods(session, CARD_ID, { infobox: '0 / 6', counters: {} })
    expect(response.interaction.anytimeActions.map(action => action.id)).not.toContain(ANYTIME_ID)
    expect(response.scores?.[0]?.categories.find(category => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: 'Major_Joinery', score: 2 }))
    const receipts = response.state.events.filter(event => event.type === 'resource.moved'
      && event.from.kind === 'card' && event.from.cardId === CARD_ID)
    expect(receipts).toHaveLength(1)
    expect(receipts[0]).toMatchObject({ resources: { food: 6 } })
    expect(response.state.events.filter(event => event.type === 'card.played' && event.cardId === 'Major_Joinery')).toHaveLength(1)
    record('redeemed', response)

    session = restore(session)
    expectPublicCardGoods(session, CARD_ID, { infobox: '0 / 6' })
    response = ok(session.undoAction())
    expect(response.state.players[0]!.improvements).not.toContain('Major_Joinery')
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.food).toBe(6)
    expectPublicCardGoods(session, CARD_ID, { infobox: '6 / 6' })
    response = redeem(session, response)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.food).toBe(0)
    expect(response.state.events.filter(event => event.type === 'card.played' && event.cardId === 'Major_Joinery')).toHaveLength(1)
    expectPublicCardGoods(session, CARD_ID, { infobox: '0 / 6' })
  })

  it('keeps one stored food after a seven-food redemption without rewriting a stale infobox', () => {
    const session = setup({ stored: 7, food: 0 })
    const before = session.getState()
    const resources = { ...before.state.players[0]!.resources }
    const response = redeem(session, before)
    expect(response.state.players[0]!.resources).toEqual(resources)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.food).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.infobox).toBe('stale')
    expectPublicCardGoods(session, CARD_ID, { infobox: '1 / 6', counters: { food: 1 } })
  })

  it.each(['decline', 'no-food', 'in-hand'] as const)('does not store food with %s', condition => {
    const session = setup({ food: condition === 'no-food' ? 0 : 1, played: condition !== 'in-hand' })
    let response = reachWorkEnd(session)
    if (condition === 'decline') response = passPreparationExchanges(session, choose(session, response, '__skip__'))
    expect(response.state.round).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(condition === 'no-food' ? 0 : 1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.food).toBe(5)
    expect(response.interaction.anytimeActions.map(action => action.id)).not.toContain(ANYTIME_ID)
    assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, ANYTIME_ID))
  })

  it('rejects an opponent trying to redeem the owner food without changing the public state', () => {
    const session = setup({ stored: 6 })
    assertRejectedUnchanged(session, () => session.takeAnytimeAction(1, ANYTIME_ID))
    expectPublicCardGoods(session, CARD_ID, { infobox: '6 / 6' })
  })
})
