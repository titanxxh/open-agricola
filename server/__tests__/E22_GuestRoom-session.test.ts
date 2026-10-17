import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardStack, pushToCardStack } from '../../shared/cards/helpers/card-state'
import { familySize, inactiveWorkersInSupply, setActiveWorkerCount, workersAtHome, workersAvailable } from '../../shared/domain/player'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { chooseSupplyWorkerTurn, takeNormalWorkerTurn } from './_helpers/supply-worker-turn'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit32Supply from './_helpers/audit/ae-negative-32-supply'

const CARD_ID = 'E022_GuestRoom'

const setup = () => {
  const session = new GameSession(8022, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.round = 5
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = index === 0 ? [CARD_ID] : ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources.food = index === 0 ? 5 : 20
    player.resources.wood = index === 0 ? 4 : 0
    player.resources.reed = index === 0 ? 1 : 0
  })
  session.loadState(state)
  return session
}

const buy = (session: GameSession, food = 5) => {
  let response = session.takeAction(0, 'major-improvement')
  for (let step = 0; step < 3 && response.interaction.stateId === 'wait' &&
    response.interaction.request.kind !== 'resource-quantity-select'; step++) {
    const options = response.interaction.request.options ?? []
    const option = options.find((entry) => entry.value === CARD_ID)
      ?? options.find((entry) => entry.value.startsWith('action-improvement-'))
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, option!.value)
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'resource-quantity-select' } })
  expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0, food })
  return response
}

describe('E022 Guest Room supply placements', () => {
  it('refreshes food storage capacity after cooking without repeating the purchase', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.resources.food = 1
    player.resources.sheep = 1
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep']));
    player.improvements = ['Major_Fireplace1']
    expect(buy(session, 1).interaction.request).toMatchObject({ availableByResource: { food: 1 } })
    let response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    const cooking = response.interaction.request.options.find((option) =>
      option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesPaid?.sheep === 1)!
    response = session.resolveChoice(0, cooking.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request).toMatchObject({ kind: 'resource-quantity-select', availableByResource: { food: 3 } })
    const before = structuredClone(response.state.players)
    response = session.commitSelectionChoice(0, { resourceCounts: { food: 4 } })
    expect(response.ok).toBe(false)
    expect(response.state.players).toEqual(before)
    expect(response.interaction.stateId).toBe('wait')
    response = session.commitSelectionChoice(0, { resourceCounts: { food: 3 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0, reed: 0 })
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual(['food', 'food', 'food'])
    expect(response.state.players[0]!.minorPlayed.filter((id) => id === CARD_ID)).toHaveLength(1)
  })

  it.each([0, 2, 5])('stores the chosen %i food through the purchase selection', (food) => {
    const session = setup()
    buy(session)
    const response = session.commitSelectionChoice(0, { resourceCounts: { food } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(5 - food)
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual(Array.from({ length: food }, () => 'food'))
  })

  it('rejects an invalid amount atomically and keeps the purchase selection', () => {
    const session = setup()
    const pending = buy(session)
    const before = JSON.stringify(pending.state.players[0])
    for (const food of [-1, 6, 1.5]) {
      const response = session.commitSelectionChoice(0, { resourceCounts: { food } })
      expect(response.ok).toBe(false)
      expect(JSON.stringify(response.state.players[0])).toBe(before)
      expect(response.interaction).toEqual(pending.interaction)
    }
    expect(session.commitSelectionChoice(0, { resourceCounts: { food: 2 } }).ok).toBe(true)
  })

  it('spends one card food for a normal rotation turn and becomes available again next round', () => {
    const session = setup()
    buy(session)
    expect(session.commitSelectionChoice(0, { resourceCounts: { food: 2 } }).ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    const workerId = inactiveWorkersInSupply(session.state.players[0]!)[0]!.id
    const pending = chooseSupplyWorkerTurn(session, CARD_ID)
    expect(getCardStack(pending.state.players[0]!, CARD_ID)).toHaveLength(1)
    expect(pending.state.players[0]!.resources.food).toBe(3)
    const placed = session.resolveChoice(0, 'day-laborer')
    expect(placed.ok, placed.error).toBe(true)
    expect(placed.state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy)
      .toContainEqual({ playerId: placed.state.players[0]!.id, workerId })
    expect(familySize(placed.state.players[0]!)).toBe(2)
    expect(workersAtHome(placed.state, placed.state.players[0]!)).toHaveLength(1)
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    expect(session.takeAction(1, 'clay-pit').ok).toBe(true)
    const again = confirmNextPlayer(session)
    expect(again.ok, again.error).toBe(true)
    expect(again.interaction.stateId).toBe('idle')
    expect(again.interaction.anytimeActions.map((action) => action.id)).not.toContain('E22-guest-room-anytime')
    expect(takeNormalWorkerTurn(session, 'reed-bank').ok).toBe(true)
    const nextRound = confirmNextPlayer(session)
    expect(nextRound.ok, nextRound.error).toBe(true)
    expect(nextRound.state.round, JSON.stringify(nextRound.interaction)).toBe(6)
    const next = chooseSupplyWorkerTurn(session, CARD_ID)
    expect(getCardStack(next.state.players[0]!, CARD_ID)).toHaveLength(0)
    expect(familySize(next.state.players[0]!)).toBe(2)
  })

  it.each(['no-food', 'no-supply'] as const)('does not offer a placement with %s', (reason) => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.minorPlayed = [CARD_ID]
    if (reason === 'no-supply') {
      setActiveWorkerCount(state.players[0]!, 5)
      pushToCardStack(state.players[0]!, CARD_ID, ['food'])
    }
    session.loadState(state)
    expect(session.getState().interaction.stateId).toBe('idle')
  })
})

describe('ae-negative-32-supply', () => {
  const { sessions, save, ok, pendingCard, finish, progress, buy, supplyMenu, supplyPlace, guest, deposit } = audit32Supply
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E022 N1 actual four wood one reed purchase bounds food storage and one stored food pays for one finite supply placement without family growth', () => { const s = guest(), p = buy(s, 'E022_GuestRoom'); assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'resource-quantity-select'); const over = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { resourceCounts: { food: 3 } })), negative = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { resourceCounts: { food: -1 } })), other = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { resourceCounts: { food: 1, grain: 1 } })), stored = finish(s, ok(s.commitSelectionChoice(0, { resourceCounts: { food: 2 } }))); assert.deepEqual([stored.state.players[0]!.resources.wood, stored.state.players[0]!.resources.reed, stored.state.players[0]!.resources.food, getCardStack(stored.state.players[0]!, 'E022_GuestRoom').length], [0, 0, 0, 2]); const due = progress(s, 6, 'E022_GuestRoom'), steps = supplyPlace(s, 'E022_GuestRoom'); assert.deepEqual([getCardStack(steps.r.state.players[0]!, 'E022_GuestRoom').length, familySize(steps.r.state.players[0]!), workersAvailable(steps.r.state, steps.r.state.players[0]!)], [1, 2, 2]); assert.equal(steps.r.state.players[0]!.workers.length, 5); save('E022-N1', { p, over, negative, other, stored, due, steps }); });
  it('E022 N2 no second same round payment and a natural next round permits exactly the second stored food use', () => { const s = guest(), stored = deposit(s), due = progress(s, 6, 'E022_GuestRoom'), before = supplyMenu(s); assert.ok(before.interaction.stateId === 'wait' && before.interaction.request.kind === 'choice'); const value = before.interaction.request.options.find(o => o.sourceCard === 'E022_GuestRoom')?.value; assert.ok(value); const steps = supplyPlace(s, 'E022_GuestRoom'), repeat = assertRejectedUnchanged(s, () => s.resolveChoice(0, value)); assert.equal(getCardStack(repeat.state.players[0]!, 'E022_GuestRoom').length, 1); const next = progress(s, 7, 'E022_GuestRoom'), second = supplyPlace(s, 'E022_GuestRoom'); assert.equal(getCardStack(second.r.state.players[0]!, 'E022_GuestRoom').length, 0); assert.equal(familySize(second.r.state.players[0]!), 2); save('E022-N2', { stored, due, before, steps, repeat, next, second }); });
  it('E022 N3 zero storage and insufficient building resources cannot grant a free supply person', () => { const s = guest(), stored = deposit(s, 0), next = progress(s, 6, 'E022_GuestRoom'); assert.equal(pendingCard(next, 'E022_GuestRoom'), false); assert.equal(getCardStack(next.state.players[0]!, 'E022_GuestRoom').length, 0); assert.equal(familySize(next.state.players[0]!), 2); const t = guest(2, 2, 5, 3), poor = buy(t, 'E022_GuestRoom'); assert.ok(poor.state.players[0]!.minorHand.includes('E022_GuestRoom')); const bad = assertRejectedUnchanged(t, () => t.resolveChoice(0, 'E022_GuestRoom')); save('E022-N3', { stored, next, poor, bad }); });
  it('E022 N4 declining the extra turn preserves stored food and all five active family identities leave no supply person to hire', () => { const s = guest(), stored = deposit(s), due = progress(s, 6, 'E022_GuestRoom'); supplyMenu(s); const ordinary = finish(s, ok(takeNormalWorkerTurn(s, 'forest'))); assert.equal(getCardStack(ordinary.state.players[0]!, 'E022_GuestRoom').length, 2); assert.equal(pendingCard(ordinary, 'E022_GuestRoom'), false); const t = guest(100, 5, 12), all = deposit(t), next = progress(t, 13, 'E022_GuestRoom'); assert.equal(pendingCard(next, 'E022_GuestRoom'), false); assert.equal(familySize(next.state.players[0]!), 5); assert.equal(getCardStack(next.state.players[0]!, 'E022_GuestRoom').length, 2); assert.equal(next.state.players[0]!.workers.length, 5); save('E022-N4', { stored, due, ordinary, all, next }); });
})
