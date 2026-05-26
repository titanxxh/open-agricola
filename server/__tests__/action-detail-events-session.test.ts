import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { ActionDefinition, ActionSpace, Resource } from '../../shared/contract/types'

const emptyResources = (): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
})

describe('action detail events', () => {
  it('records legacy action detail deltas as public events and UI log entries', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.players.forEach((player) => {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    state.actionSpaces.push({
      id: '__test_legacy_gain',
      nameKey: 'actions.testLegacyGain.name',
      descriptionKey: 'actions.testLegacyGain.description',
      roundAvailable: 1,
      gainPerRound: {},
      resources: emptyResources(),
      takenBy: [],
      canBeExecutedByPlayer: () => true,
      execute: ({ player }) => {
        player.resources.food += 2
        return { type: 'ok', resourcesGained: { food: 2 } }
      },
    } as ActionSpace)
    session.loadState(state)

    const resp = session.takeAction(0, '__test_legacy_gain')

    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'action.detailLogged',
        playerId: 'p1',
        actionId: '__test_legacy_gain',
        detailParts: expect.objectContaining({
          gains: expect.objectContaining({ food: 2 }),
        }),
      }),
    ]))
    expect(resp.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'log.actionDetail',
        params: expect.objectContaining({
          action: 'actions.testLegacyGain.name',
          detailParts: expect.objectContaining({
            gains: expect.objectContaining({ food: 2 }),
          }),
        }),
      }),
    ]))
  })

  it('flushes events before returning a farm-select pending prompt', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.players.forEach((player) => {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    const action: ActionDefinition = {
      id: '__test_event_before_farm_select',
      nameKey: 'actions.testEventBeforeFarmSelect.name',
      descriptionKey: 'actions.testEventBeforeFarmSelect.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ eventSink, player }) => {
        eventSink.emit<'resource.moved'>({
          type: 'resource.moved',
          resources: { wood: 1 },
          from: { kind: 'supply' },
          to: { kind: 'player', playerId: player.id },
          reason: 'gain',
        })
        return {
          type: 'request',
          request: {
            kind: 'farm-select',
            farm: { farmType: 'plow', selectableTiles: [{ row: 0, col: 0 }] },
            options: [{ value: 'confirm', labelKey: 'ui.interactionPlowConfirm' }],
          },
          promptKey: 'ui.interactionPlowSelect',
        }
      },
      resolveChoice: () => ({ type: 'ok' }),
    }
    state.actionSpaces.push({
      ...action,
      resources: emptyResources(),
      takenBy: [],
    } as ActionSpace)
    session.loadState(state)

    const resp = session.takeAction(0, action.id)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('farm-select')
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        sourceActionId: action.id,
        resources: { wood: 1 },
      }),
    ]))
  })

  it('flushes events before returning a selection pending prompt', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.players.forEach((player) => {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    const action: ActionDefinition = {
      id: '__test_event_before_selection',
      nameKey: 'actions.testEventBeforeSelection.name',
      descriptionKey: 'actions.testEventBeforeSelection.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ eventSink, player }) => {
        eventSink.emit<'resource.moved'>({
          type: 'resource.moved',
          resources: { food: 1 },
          from: { kind: 'supply' },
          to: { kind: 'player', playerId: player.id },
          reason: 'gain',
        })
        return {
          type: 'request',
          request: {
            kind: 'choice',
            options: [{ value: 'confirm', labelKey: 'ui.interactionSelectionConfirm' }],
          },
          promptKey: 'ui.interactionSelection',
          promptParams: { maxSelections: 1, minSelections: 0 },
        }
      },
      resolveChoice: () => ({ type: 'ok' }),
    }
    state.actionSpaces.push({
      ...action,
      resources: emptyResources(),
      takenBy: [],
    } as ActionSpace)
    session.loadState(state)

    const resp = session.takeAction(0, action.id)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.selection?.kind).toBe('farm-position')
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        sourceActionId: action.id,
        resources: { food: 1 },
      }),
    ]))
  })
})
