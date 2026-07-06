/**
 * Smoke test for CardEffect.resolveChoice hook + GameSession dispatch.
 *
 * Strategy:
 *  1. Register a synthetic test occupation (__TEST_RC_CARD__) whose onBuy returns an XOR
 *     choice flow (building resources), so the engine emits a pending 'choice' with
 *     sourceCard = '__TEST_RC_CARD__' after the card is played.
 *  2. Play the card via the `lessons` action path so onBuy is triggered properly.
 *  3. With the resolveChoice handler registered on the test card, call resolveChoice on
 *     the XOR choice. Assert the handler was invoked with correct args.
 *  4. When the handler returns an ActionFlow (gain 5 food), verify the resource was granted.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ResolveChoiceHandler } from '../../shared/cards/card-effects'
import { Occupation } from '../../shared/cards/registry-display'
import { registerAdHocOccupation } from '../../shared/cards/registry-runtime'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { ActionFlow } from '../../shared/contract/types'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

const TEST_CARD_ID = '__TEST_RC_CARD__'

// Build an XOR flow: pick one building resource (all children carry sourceCard so
// the engine propagates pending.sourceCard correctly).
const buildTestOnBuyFlow = (): ActionFlow => ({
  type: 'xor',
  children: [
    { type: 'leaf', actionId: 'gain', sourceCard: TEST_CARD_ID, params: { wood: 1 } },
    { type: 'leaf', actionId: 'gain', sourceCard: TEST_CARD_ID, params: { clay: 1 } },
  ],
})

// Synthetic Occupation card so getOccupation() can find it.
const testCard = new Occupation({
  id: TEST_CARD_ID,
  name: 'Test ResolveChoice Card',
  deck: 'X',
  number: 9999,
  desc: ['Test card for resolveChoice hook smoke test.'],
  cost: {},
  players: '1+',
})

// Track the occupation so getOccupation() returns it.
let occupationRegistered = false

beforeEach(() => {
  if (!occupationRegistered) {
    registerAdHocOccupation(testCard)
    occupationRegistered = true
  }
  // Register card effect with a basic onBuy (XOR choice).
  // resolveChoice is set per-test.
  requireActiveCardRegistry('card-effect-resolve-choice').setEffect({
    id: TEST_CARD_ID,
    onBuy: () => buildTestOnBuyFlow(),
  })
})

afterEach(() => {
  // Re-register without resolveChoice to clean up between tests.
  requireActiveCardRegistry('card-effect-resolve-choice').setEffect({
    id: TEST_CARD_ID,
    onBuy: () => buildTestOnBuyFlow(),
  })
})

/**
 * Build a session with player 0 having the test card in hand and enough food
 * to play it for free (first occupation on lessons = 0 food).
 */
const makeSession = () => {
  const effect = getCardEffect(TEST_CARD_ID) ?? {
    id: TEST_CARD_ID,
    onBuy: () => buildTestOnBuyFlow(),
  }
  const session = new GameSession(undefined, undefined, { playerCount: 4 })
  requireActiveCardRegistry('card-effect-resolve-choice').setEffect(effect)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = [TEST_CARD_ID]
  player.resources.food = 10
  state.players[1]!.workersAvailable = 2
  session.loadState(state)
  return session
}

describe('CardEffect.resolveChoice hook', () => {
  it('getCardEffect returns the registered resolveChoice handler', () => {
    const handler: ResolveChoiceHandler = () => undefined
    requireActiveCardRegistry('card-effect-resolve-choice').setEffect({
      id: TEST_CARD_ID,
      onBuy: () => buildTestOnBuyFlow(),
      resolveChoice: handler,
    })
    const effect = getCardEffect(TEST_CARD_ID)
    expect(effect?.resolveChoice).toBe(handler)
  })

  it('resolveChoice handler is invoked when a pending choice with matching sourceCard is resolved', () => {
    const invocations: { choice: string; ctx: { sourceCard: string } }[] = []

    requireActiveCardRegistry('card-effect-resolve-choice').setEffect({
      id: TEST_CARD_ID,
      onBuy: () => buildTestOnBuyFlow(),
      resolveChoice: (_state, _player, choice, ctx) => {
        invocations.push({ choice, ctx })
      },
    })

    const session = makeSession()

    // takeAction on lessons auto-resolves occupation when only one occupation
    // is in hand (engine.maybeBuildChoiceCandidates short-circuits with 1 option).
    // That triggers onBuy, which returns our XOR flow.  The engine steps into the
    // XOR and blocks, leaving pending.type === 'choice' with sourceCard === TEST_CARD_ID.
    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // The pending choice should be the onBuy XOR, attributed to our test card
    expect(resp.interaction.sourceCard).toBe(TEST_CARD_ID)

    // Resolve the XOR choice → our resolveChoice handler should fire
    const xorOption = resp.interaction.request.options[0]
    expect(xorOption).toBeDefined()
    resp = session.resolveChoice(0, xorOption!.value)
    expect(resp.ok).toBe(true)

    // Assert handler was called with the expected arguments
    expect(invocations.length).toBe(1)
    expect(invocations[0]!.choice).toBe(xorOption!.value)
    expect(invocations[0]!.ctx.sourceCard).toBe(TEST_CARD_ID)
  })

  it('resolveChoice handler that returns a flow causes the flow to be executed', () => {
    const BONUS_FOOD = 5

    requireActiveCardRegistry('card-effect-resolve-choice').setEffect({
      id: TEST_CARD_ID,
      onBuy: () => buildTestOnBuyFlow(),
      resolveChoice: (): ActionFlow => ({
        type: 'leaf',
        actionId: 'gain',
        sourceCard: TEST_CARD_ID,
        params: { food: BONUS_FOOD },
      }),
    })

    const session = makeSession()

    // lessons auto-resolves the occupation (one card in hand) → onBuy XOR
    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe(TEST_CARD_ID)

    const foodBefore = resp.state.players[0]!.resources.food
    const xorOption = resp.interaction.request.options[0]
    expect(xorOption).toBeDefined()

    // resolveChoice fires our handler, which inserts a gain-food flow.
    // The engine then resolves the XOR and executes the inserted flow.
    resp = session.resolveChoice(0, xorOption!.value)
    expect(resp.ok).toBe(true)

    // The handler returned a gain-food flow; engine should have executed it
    const foodAfter = resp.state.players[0]!.resources.food
    expect(foodAfter).toBeGreaterThanOrEqual(foodBefore + BONUS_FOOD)
  })

  it('resolveChoice follow-up flow inherits targeted pending owner', () => {
    const BONUS_FOOD = 5

    requireActiveCardRegistry('card-effect-resolve-choice').setEffect({
      id: TEST_CARD_ID,
      onBuy: (): ActionFlow => ({
        ...buildTestOnBuyFlow(),
        targetPlayerId: 'p2',
      }),
      resolveChoice: (): ActionFlow => ({
        type: 'leaf',
        actionId: 'gain',
        sourceCard: TEST_CARD_ID,
        params: { food: BONUS_FOOD },
      }),
    })

    const session = makeSession()
    const before = session.getState().state
    const p1FoodBefore = before.players[0]!.resources.food
    const p2FoodBefore = before.players[1]!.resources.food

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')

    resp = confirmPlayerSwitch(session)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(1)
    expect(resp.interaction.sourceCard).toBe(TEST_CARD_ID)

    const xorOption = resp.interaction.request.options[0]
    expect(xorOption).toBeDefined()

    resp = session.resolveChoice(1, xorOption!.value)
    expect(resp.ok).toBe(true)

    expect(resp.state.players[1]!.resources.food).toBe(p2FoodBefore + BONUS_FOOD)
    expect(resp.state.players[0]!.resources.food).toBe(p1FoodBefore)
  })

  it('resolveChoice handler is NOT called when sourceCard does not match', () => {
    let handlerCalled = false
    requireActiveCardRegistry('card-effect-resolve-choice').setEffect({
      id: TEST_CARD_ID,
      onBuy: () => buildTestOnBuyFlow(),
      resolveChoice: () => {
        handlerCalled = true
      },
    })

    // Use a different session path that does not produce a pending choice with
    // sourceCard === TEST_CARD_ID.  We test this by verifying the handler is
    // never called when there is no pending choice with our sourceCard.
    const session = makeSession()
    // day-laborer: no pending choice produced (all resources granted immediately)
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(handlerCalled).toBe(false)
  })
})
