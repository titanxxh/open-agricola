import { installOfficialCardRegistry } from '../../cards/__tests__/card-environment'

installOfficialCardRegistry()

import { describe, expect, it } from 'vitest'
import { EngineStack } from '../../engine'
import { createInitialState } from '../state-bootstrap'
import { serializeStateForPlayer } from '../serialization'
import { initStagedDraftState } from '../../draft/draft-manager'
import { createParentSelectionState } from '../../parents/selection'
import { redactInteractionForViewer } from '../interaction-state-adapter'
import { privateEventsForViewer } from '../interaction-privacy'
import type { InteractionState } from '../../contract/types'
import type { PrivateGameEvent } from '../../contract/private-events'

describe('visible seat projection', () => {
  it('shows hands and declared private card state for two visible seats and hides the third', () => {
    const state = createInitialState(1598, { playerCount: 3 })
    state.players.forEach((player, index) => {
      player.occupationHand = [`occupation-${index + 1}`]
      player.minorHand = [`minor-${index + 1}`]
      player.cardStates = { privateCard: { privateData: { value: index + 1 }, extraData: { internal: true } } }
    })

    const projected = serializeStateForPlayer(state, ['p1', 'p2'], { engineStack: new EngineStack() })

    expect(projected.players.map(player => player.occupationHand)).toEqual([
      ['occupation-1'], ['occupation-2'], ['?'],
    ])
    expect(projected.players.map(player => player.minorHand)).toEqual([
      ['minor-1'], ['minor-2'], ['?'],
    ])
    expect(projected.players.map(player => player.cardStates)).toEqual([
      { privateCard: { privateData: { value: 1 } } },
      { privateCard: { privateData: { value: 2 } } },
      {},
    ])
    expect(projected).not.toHaveProperty('gameSeed')
  })

  it('reveals each visible seat current draft packet and parent candidates without opening queued packets', () => {
    const state = createInitialState(1598, { playerCount: 3 })
    state.draft = initStagedDraftState(['p1', 'p2', 'p3'], [{
      kind: 'occupation', poolSize: 2, totalRounds: 2,
      pools: {
        p1: { occ: ['first-1', 'first-2'], minor: [] },
        p2: { occ: ['second-1', 'second-2'], minor: [] },
        p3: { occ: ['third-1', 'third-2'], minor: [] },
      },
    }])
    state.draft.stages[0]!.seats.p2!.inbox[2] = { occ: ['queued-secret'], minor: [] }
    state.parentSelection = createParentSelectionState(['p1', 'p2', 'p3'], 1598)
    const p2Candidates = state.parentSelection.candidates.p2!
    state.parentSelection.submissions.p2 = { mother: p2Candidates.mother[0]!, father: p2Candidates.father[0]! }

    const projected = serializeStateForPlayer(state, ['p1', 'p2'], { engineStack: new EngineStack() })

    expect(projected.draft!.stages[0]!.seats.p1!.inbox[1]).toEqual({ occ: ['first-1', 'first-2'], minor: [] })
    expect(projected.draft!.stages[0]!.seats.p2!.inbox[1]).toEqual({ occ: ['second-1', 'second-2'], minor: [] })
    expect(projected.draft!.stages[0]!.seats.p2!.inbox[2]).toEqual({ occ: ['?'], minor: [] })
    expect(projected.draft!.stages[0]!.seats.p3!.inbox[1]).toEqual({ occ: ['?', '?'], minor: [] })
    expect(projected.parentSelection!.candidates.p1).toEqual(state.parentSelection.candidates.p1)
    expect(projected.parentSelection!.candidates.p2).toEqual(p2Candidates)
    expect(projected.parentSelection!.submissions.p2).toEqual(state.parentSelection.submissions.p2)
    expect(projected.parentSelection!.candidates.p3).toEqual({ mother: ['?', '?'], father: ['?', '?'] })
  })

  it('uses the same visible seats for private prompts and private notifications', () => {
    const interaction: InteractionState = {
      stateId: 'wait', playerIndex: 1, sourceCard: 'private-card', promptKey: 'ui.privateTest',
      request: { kind: 'resource-batch-exchange-select', cardId: 'private-card',
        discardAvailableByResource: { wood: 2 }, receiveResources: ['clay'], maxTotal: 2 },
      allowedCommands: ['commitSelection'], anytimeActions: [],
    }
    const events: PrivateGameEvent[] = ['p1', 'p2', 'p3'].map(recipientPlayerId => ({
      schemaVersion: 1, type: 'private.handChanged', recipientPlayerId,
      cardIds: [`${recipientPlayerId}-secret`], cardType: 'minor', reason: 'card-effect',
    }))

    expect(redactInteractionForViewer(interaction, ['p1', 'p2', 'p3'], ['p1', 'p2'])).toEqual(interaction)
    expect(privateEventsForViewer(interaction, ['p1', 'p2', 'p3'], ['p1', 'p2'], events)).toEqual([
      { schemaVersion: 1, type: 'private.promptShown', recipientPlayerId: 'p2',
        promptKind: 'resource-batch-exchange-select', sourceCard: 'private-card', promptKey: 'ui.privateTest' },
      events[0], events[1],
    ])
    expect(redactInteractionForViewer(interaction, ['p1', 'p2', 'p3'], ['p3'])).toMatchObject({
      request: { kind: 'private-prompt' }, allowedCommands: [], anytimeActions: [],
    })
    expect(privateEventsForViewer(interaction, ['p1', 'p2', 'p3'], [], events)).toEqual([])
  })

  it('keeps singleton and spectator projections unchanged and never mutates its source', () => {
    const state = createInitialState(1598, { playerCount: 3 })
    const snapshot = JSON.stringify(state)
    const context = { engineStack: new EngineStack() }
    const singleton = serializeStateForPlayer(state, ['p2'], context)
    const spectator = serializeStateForPlayer(state, [], context)

    expect(singleton.players[1]!.occupationHand).toEqual(state.players[1]!.occupationHand)
    expect(singleton.players[0]!.occupationHand).toEqual(Array(7).fill('?'))
    expect(spectator.players.every(player => player.occupationHand.every(card => card === '?'))).toBe(true)
    expect(serializeStateForPlayer(state, ['unknown'], context)).toEqual(spectator)
    serializeStateForPlayer(state, ['p1', 'p2'], context)
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})
