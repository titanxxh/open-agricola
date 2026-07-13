import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { holdWorkerOnCard, getWorkerHeldOnCard } from '../../shared/cards/helpers/card-held-workers'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

describe('GameSession return-home releases card-held workers', () => {
  it('clears every heldWorkerId on every player when return-home runs', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state

    // Hold a worker on a card for each player
    holdWorkerOnCard(state.players[0]!, 'C022_BasketChair', '1')
    holdWorkerOnCard(state.players[1]!, 'X_OtherCard', '2')

    session.loadState(state)

    // Directly invoke the return-home path (private method, acceptable in tests)
    ;(session as unknown as { continueReturnHomeHooks: () => void }).continueReturnHomeHooks()

    const afterState = session.getState().state
    expect(getWorkerHeldOnCard(afterState.players[0]!, 'C022_BasketChair')).toBeUndefined()
    expect(getWorkerHeldOnCard(afterState.players[1]!, 'X_OtherCard')).toBeUndefined()
  })

  it('does not remove other extraData keys when releasing heldWorkerId', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state

    // Set a held worker AND another extraData key on player 0
    holdWorkerOnCard(state.players[0]!, 'C022_BasketChair', '1')
    // Manually add a sibling key to extraData
    const cs = state.players[0]!.cardStates!['C022_BasketChair']!
    cs.extraData = { ...(cs.extraData ?? {}), someCounter: 42 }

    session.loadState(state)
    ;(session as unknown as { continueReturnHomeHooks: () => void }).continueReturnHomeHooks()

    const afterState = session.getState().state
    // heldWorkerId must be gone
    expect(getWorkerHeldOnCard(afterState.players[0]!, 'C022_BasketChair')).toBeUndefined()
    // other extraData keys must survive
    expect(afterState.players[0]!.cardStates?.['C022_BasketChair']?.extraData?.['someCounter']).toBe(42)
  })
})
