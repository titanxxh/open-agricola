import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners } from '../../shared/cards/card-listeners'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/A/A83_ShepherdsCrook'

const edgesForTwoByTwo = [
  'H-0-1',
  'H-0-2',
  'H-2-1',
  'H-2-2',
  'V-0-1',
  'V-1-1',
  'V-0-3',
  'V-1-3',
]

describe('A83_ShepherdsCrook session flow', () => {
  it('uses fence delta in listener context to grant sheep', () => {
    expect(getRegisteredCardListeners().some((entry) => entry.id === 'A83-shepherds-crook-after-fencing')).toBe(true)
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push('A83_ShepherdsCrook')
    player.resources.wood = 10

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionFenceSelect')

    resp = session.resolveChoice(0, 'confirm', {
      edges: edgesForTwoByTwo,
      extraWood: 0,
    })

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.players[0]!.resources.sheep).toBe(2)
    expect(readCardResourceStats(resp.state.players[0]!, 'A83_ShepherdsCrook')).toMatchObject({
      paid: {},
      gained: { sheep: 2 },
    })
  })
})
