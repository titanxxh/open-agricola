import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { holdWorkerOnCard, getWorkerHeldOnCard } from '../../shared/cards/helpers/card-held-workers'

describe('GameSession return-home releases card-held workers', () => {
  it('clears every heldWorkerId on every player when return-home runs', () => {
    const session = new GameSession()
    const state = session.getState().state

    // Hold a worker on a card for each player
    holdWorkerOnCard(state.players[0]!, 'C22_BasketChair', '1')
    holdWorkerOnCard(state.players[1]!, 'X_OtherCard', '2')

    session.loadState(state)

    // Directly invoke the return-home path (private method, acceptable in tests)
    ;(session as any).continueReturnHomeHooks()

    const afterState = session.getState().state
    expect(getWorkerHeldOnCard(afterState.players[0]!, 'C22_BasketChair')).toBeUndefined()
    expect(getWorkerHeldOnCard(afterState.players[1]!, 'X_OtherCard')).toBeUndefined()
  })

  it('does not remove other extraData keys when releasing heldWorkerId', () => {
    const session = new GameSession()
    const state = session.getState().state

    // Set a held worker AND another extraData key on player 0
    holdWorkerOnCard(state.players[0]!, 'C22_BasketChair', '1')
    // Manually add a sibling key to extraData
    const cs = state.players[0]!.cardStates!['C22_BasketChair']!
    cs.extraData = { ...(cs.extraData ?? {}), someCounter: 42 }

    session.loadState(state)
    ;(session as any).continueReturnHomeHooks()

    const afterState = session.getState().state
    // heldWorkerId must be gone
    expect(getWorkerHeldOnCard(afterState.players[0]!, 'C22_BasketChair')).toBeUndefined()
    // other extraData keys must survive
    expect(afterState.players[0]!.cardStates?.['C22_BasketChair']?.extraData?.['someCounter']).toBe(42)
  })
})
