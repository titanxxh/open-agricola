import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import type { DraftGameEvent } from '../../shared/contract/events'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A083_ShepherdsCrook'

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

const fenceBuilt = (
  newPastures: Array<{ tiles?: unknown[] }>,
): DraftGameEvent<'farm.fenceBuilt'> => ({
  type: 'farm.fenceBuilt',
  fences: [{ edge: 'H-0-0', type: 'fence' }],
  newFenceEdges: ['H-0-0'],
  newPastures,
})

describe('A083_ShepherdsCrook session flow', () => {
  it('uses fence delta in listener context to grant sheep', () => {
    expect(getRegisteredCardListeners().some((entry) => entry.id === 'A83-shepherds-crook-after-fencing')).toBe(true)
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push('A083_ShepherdsCrook')
    player.resources.wood = 10

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionFenceSelect')

    resp = session.commitSelectionChoice(0, {
      edges: edgesForTwoByTwo,
      extraWood: 0,
    })
    resp = resolveTriggerIfPresent(session, resp, 'A083_ShepherdsCrook')

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.players[0]!.resources.sheep).toBe(2)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.fenceBuilt',
        newPastures: expect.arrayContaining([
          expect.objectContaining({
            tiles: expect.arrayContaining([
              expect.objectContaining({ row: expect.any(Number), col: expect.any(Number) }),
            ]),
          }),
        ]),
      }),
    ]))
    expect(readCardResourceStats(resp.state.players[0]!, 'A083_ShepherdsCrook')).toMatchObject({
      paid: {},
      gained: { sheep: 2 },
    })
  })

  it('does not grant sheep for smaller new pasture event metadata', () => {
    const listener = getRegisteredCardListeners().find((entry) => entry.id === 'A83-shepherds-crook-after-fencing')
    expect(listener).toBeDefined()
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push('A083_ShepherdsCrook')
    const actionEvents = [fenceBuilt([{ tiles: [{ row: 0, col: 0 }] }])]

    const result = executeCardListener(listener!, {
      state,
      player,
      space: state.actionSpaces.find((entry) => entry.id === 'fencing')!,
      actionId: 'fence',
      phase: 'immediatelyAfter',
      result: { type: 'ok', extraData: { newPastures: [{ tiles: [{}, {}, {}, {}] }] } },
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
