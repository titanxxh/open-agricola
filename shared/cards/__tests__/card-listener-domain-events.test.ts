import { describe, expect, it } from 'vitest'
import { createInitialState } from '../../session/state-bootstrap'
import type { DraftGameEvent } from '../../contract/events'
import { runCardListeners, type CardListenerRegistration } from '../card-listeners'

const CARD_ID = 'B140_FarmyardWorker'

const listener = {
  id: 'domain-sowing-reward',
  cardIds: [CARD_ID],
  events: ['farm.sown'],
  phases: ['after'],
  handler: () => ({ sourceCard: CARD_ID, flow: {
    type: 'leaf', actionId: 'gain', params: { resources: { food: 2 } },
  } }),
} satisfies CardListenerRegistration

const sowing: DraftGameEvent = {
  type: 'farm.sown',
  sows: [{ location: { kind: 'field', playerId: 'p1', row: 0, col: 1 }, crop: 'grain', added: 3 }],
}

const react = (actionEvents: readonly DraftGameEvent[] | undefined, transactionEvents: readonly DraftGameEvent[] = []) => {
  const state = createInitialState(42, { playerCount: 2 })
  const player = state.players[0]!
  player.occupationPlayed = [CARD_ID]
  return runCardListeners({
    actionHooks: undefined, state, player, space: state.actionSpaces[0]!,
    actionId: 'sow', phase: 'after', actionEvents, transactionEvents,
  }, [listener])
}

describe('domain fact subscriptions', () => {
  it('produces the declared reward only when the completed host committed a matching fact', () => {
    expect(react([sowing])).toEqual([{ sourceCard: CARD_ID, flow: {
      type: 'leaf', actionId: 'gain', params: { resources: { food: 2 } },
    } }])
    expect(react([])).toEqual([])
  })

  it('does not treat an earlier transaction fact as this host committing a change', () => {
    expect(react([], [sowing])).toEqual([])
    expect(react(undefined, [sowing])).toEqual([])
  })
})
