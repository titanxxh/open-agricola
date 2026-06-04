/**
 * Test for rejecting resolveChoice calls with disabled options.
 *
 * Verifies that resolvePendingChoice guards against choosing an option
 * marked disabled: true.
 *
 * Strategy:
 *  1. Set up a session with a pending choice that has multiple options.
 *  2. Mutate the pending state to mark one option as disabled.
 *  3. Attempt to resolve with the disabled option → expect rejection.
 *  4. Verify resolving with a non-disabled option still succeeds.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { Occupation } from '../../shared/cards/registry-display'
import { registerAdHocOccupation } from '../../shared/cards/registry-runtime'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { ActionFlow } from '../../shared/contract/types'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'

const TEST_CARD_ID = '__TEST_DISABLED_OPTION_CARD__'

// Build an XOR flow with 2 choices (wood or clay).
const buildTestOnBuyFlow = (): ActionFlow => ({
  type: 'xor',
  children: [
    { type: 'leaf', actionId: 'gain', sourceCard: TEST_CARD_ID, params: { wood: 1 } },
    { type: 'leaf', actionId: 'gain', sourceCard: TEST_CARD_ID, params: { clay: 1 } },
  ],
})

// Synthetic Occupation card for discovery.
const testCard = new Occupation({
  id: TEST_CARD_ID,
  name: 'Test Disabled Option Card',
  deck: 'X',
  number: 9998,
  desc: ['Test card for disabled option guard.'],
  cost: {},
  players: '1+',
})

let occupationRegistered = false

beforeEach(() => {
  if (!occupationRegistered) {
    registerAdHocOccupation(testCard)
    occupationRegistered = true
  }
  requireActiveCardRegistry('choice-disabled-option').setEffect({
    id: TEST_CARD_ID,
    onBuy: () => buildTestOnBuyFlow(),
  })
})

/**
 * Build a session with player 0 having the test card in hand.
 */
const makeSession = () => {
  const session = new GameSession(undefined, undefined, { playerCount: 4 })
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

describe('disabled option in pending choice', () => {
  it('rejects resolveChoice when chosen option is marked disabled: true', () => {
    const session = makeSession()

    // Play the occupation → triggers onBuy XOR choice
    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Get the first option (wood) and mutate it to be disabled
    const firstOption = resp.interaction.options[0]!
    expect(firstOption).toBeDefined()

    // S2 Task 8: composite-node emit metadata now lives on the node itself
    // (XorNode.emittedChoices). Mutate that to flip the `disabled` flag.
    const composite = session.getEngineStack().peekPendingChoiceFromComposite()!
    composite.options[0]!.disabled = true

    // Attempt to resolve with the disabled option → should be rejected before dispatch.
    resp = session.resolveChoice(0, firstOption.value)
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('invalid choice value')
  })

  it('still allows resolveChoice on a non-disabled option when another is disabled', () => {
    const session = makeSession()

    // Play the occupation → triggers onBuy XOR choice
    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const firstOption = resp.interaction.options[0]!
    const secondOption = resp.interaction.options[1]!
    expect(firstOption).toBeDefined()
    expect(secondOption).toBeDefined()

    // S2 Task 8: composite-node emit metadata now lives on the node itself
    // (XorNode.emittedChoices). Mutate that to flip the `disabled` flag.
    const composite = session.getEngineStack().peekPendingChoiceFromComposite()!
    composite.options[0]!.disabled = true

    // Attempt to resolve with the second (non-disabled) option → should succeed
    resp = session.resolveChoice(0, secondOption.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })
})
