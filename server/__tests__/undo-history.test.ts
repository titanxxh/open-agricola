import { describe, expect, it, beforeEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

describe('undo history on player switch', () => {
  let session: GameSession

  beforeEach(() => {
    session = new GameSession()
    stabilizeRandomHands(session.state.players)
  })

  it('should have undo history after taking an action', () => {
    // Player 1 takes an action
    const takeResult = session.takeAction(0, 'forest')
    expect(takeResult.ok).toBe(true)
    expect(takeResult.historyLength).toBeGreaterThan(0)
    expect(takeResult.hasActionStartSnapshot).toBe(true)
  })

  it('should clear undo history when switching players', () => {
    // Player 1 takes an action
    const takeResult = session.takeAction(0, 'forest')
    expect(takeResult.ok).toBe(true)
    expect(takeResult.historyLength).toBeGreaterThan(0)

    // Player 1 confirms next player
    const confirmResult = confirmNextPlayer(session)
    expect(confirmResult.ok).toBe(true)
    
    // After switching, history should be cleared
    expect(confirmResult.historyLength).toBe(0)
    expect(confirmResult.hasActionStartSnapshot).toBe(false)
  })

  it('should not allow undo after player switch', () => {
    // Player 1 takes an action
    session.takeAction(0, 'forest')
    
    // Player 1 confirms next player
    confirmNextPlayer(session)
    
    // Try to undo - should fail because history is cleared
    const undoResult = session.undoStep()
    expect(undoResult.ok).toBe(false)
    expect(undoResult.error).toBe('no history to undo')
  })

  it('should not allow undoAction after player switch', () => {
    // Player 1 takes an action
    session.takeAction(0, 'forest')
    
    // Player 1 confirms next player
    confirmNextPlayer(session)
    
    // Try to undo action - should fail because no action snapshot
    const undoActionResult = session.undoAction()
    expect(undoActionResult.ok).toBe(false)
    expect(undoActionResult.error).toBe('no action snapshot')
  })

  it('should allow new player to build their own undo history', () => {
    // Player 1 takes an action and switches
    session.takeAction(0, 'forest')
    confirmNextPlayer(session)
    
    // History should be empty for new player
    const resp = session.getState()
    expect(resp.state.currentPlayerIndex).toBe(1)
    
    // New player takes an action
    const takeResult = session.takeAction(1, 'clay-pit')
    expect(takeResult.ok).toBe(true)
    expect(takeResult.historyLength).toBeGreaterThan(0)
    
    // New player can undo their own action
    const undoResult = session.undoStep()
    expect(undoResult.ok).toBe(true)
  })
})
