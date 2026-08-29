import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { CardListenerRegistration } from '../../shared/cards/card-listeners'
import type { ActionDefinition, ActionFlow } from '../../shared/contract/types'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

const advanceSwitches = (session: GameSession, response: SessionResponse): SessionResponse => {
  let current = response
  while (
    current.interaction.stateId === 'wait' &&
    current.interaction.request.kind === 'confirm-player-switch'
  ) {
    current = confirmPlayerSwitch(session)
  }
  return current
}

const setup = (options: {
  buildingTycoon?: boolean
  clay?: number
  reed?: number
  stone?: number
  playerCount?: number
} = {}): GameSession => {
  const session = new GameSession(7, undefined, {
    playerCount: options.playerCount ?? (options.buildingTycoon === false ? 2 : 3),
  })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 6
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }

  const actor = state.players[0]!
  actor.houseType = 'clay'
  actor.rooms = 2
  actor.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
  actor.resources = {
    ...actor.resources,
    clay: options.clay ?? 3,
    reed: options.reed ?? 1,
    stone: options.stone ?? 2,
  }
  actor.minorPlayed.push('D014_HammerCrusher')
  setWorkersAtHome(state, actor, 2)

  const tycoon = state.players[1]!
  if (options.buildingTycoon !== false) tycoon.occupationPlayed.push('D128_BuildingTycoon')
  tycoon.resources.food = 1

  session.loadState(state)
  return session
}

const registerNestedConstructHelper = (
  session: GameSession,
  resources: { clay: number; reed: number },
  beforePromptResources?: { stone: number },
): number => {
  const helperCardId = '__TEST_nested_construct_helper__'
  const state = session.getState().state
  const helperPlayerIndex = state.players.length - 1
  state.players[helperPlayerIndex]!.occupationPlayed.push(helperCardId)
  session.loadState(state)

  const isDoable: CardListenerRegistration = {
    id: '__TEST_nested_construct_is_doable__',
    cardIds: [helperCardId],
    actions: ['construct'],
    phases: ['isDoable'],
    scope: 'opponent',
    handler: (context) => context.actionContext?.skipBeforeTriggers === true
      ? undefined
      : { doable: true },
  }
  const before: CardListenerRegistration = {
    id: '__TEST_nested_construct_before__',
    cardIds: [helperCardId],
    actions: ['construct'],
    phases: ['before'],
    scope: 'opponent',
    handler: (context) => {
      const recipientPlayerId = context.triggerPlayer?.id ?? context.player.id
      const optionalGain: ActionFlow = {
        type: 'leaf',
        actionId: 'gain',
        optional: true,
        promptKey: 'ui.interactionOptionalAction',
        sourceCard: helperCardId,
        params: {
          ...resources,
          recipientPlayerId,
        },
      }
      return {
        sourceCard: helperCardId,
        flow: beforePromptResources ? {
          type: 'seq',
          children: [{
            type: 'leaf',
            actionId: 'gain',
            sourceCard: helperCardId,
            params: { ...beforePromptResources, recipientPlayerId },
          }, optionalGain],
        } : optionalGain,
      }
    },
  }
  session.withCtx(() => {
    const registry = requireActiveCardRegistry('nested provisional scope test')
    registry.registerListener(isDoable)
    registry.registerListener(before)
  })
  return helperPlayerIndex
}

const registerNoopAnytime = (session: GameSession): string => {
  const id = '__TEST_nested_noop_anytime__'
  const action: ActionDefinition = {
    id,
    nameKey: 'actions.test.name',
    descriptionKey: 'actions.test.description',
    roundAvailable: 1,
    gainPerRound: {},
    anytime: true,
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
  }
  ;(session as unknown as { registry: { register: (definition: ActionDefinition) => void } })
    .registry.register(action)
  return id
}

describe('D014 Hammer Crusher provisional continuation', () => {
  it('restores the room plan while retaining Hammer Crusher resources', () => {
    let session = setup()
    let response = advanceSwitches(session, session.takeAction(0, 'house-redevelopment'))

    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Construct choice')
    const construct = response.interaction.request.options?.find(
      (option) => option.value !== '__skip__',
    )
    expect(construct).toBeDefined()

    response = session.resolveChoice(0, construct!.value)
    expect(response.interaction.stateId).toBe('wait')
    if (
      response.interaction.stateId !== 'wait' ||
      response.interaction.request.kind !== 'farm-select'
    ) throw new Error('expected room selection')
    const room = response.interaction.request.farm.selectableTiles[0]!

    response = advanceSwitches(session, session.commitSelectionChoice(0, { rooms: [room] }))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Building Tycoon choice')
    expect(response.interaction.sourceCard).toBe('D128_BuildingTycoon')
    expect(session.undoStep().ok).toBe(false)

    const snapshot = serializeSessionSnapshot(session.state, session)
    expect(snapshot.sessionCursor.provisionalContinuationScopes.length).toBeGreaterThan(0)
    session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    response = session.getState()
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .toBe('D128_BuildingTycoon')

    response = advanceSwitches(session, session.resolveChoice(1, '__skip__'))

    expect(response.ok).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected restored room selection')
    expect(response.interaction.request.kind).toBe('farm-select')
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      rooms: 2,
      resources: { clay: 5, reed: 2, stone: 2 },
    })
    expect(response.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(1)
    expect(response.scores).toHaveLength(3)

    const retry = session.commitSelectionChoice(0, { rooms: [room] })
    expect(retry.ok).toBe(false)
    expect(retry.interaction.stateId).toBe('wait')
  })

  it('records explicit ancestry and aborts only the nested Construct scope', () => {
    let session = setup({ buildingTycoon: false, clay: 0, reed: 0 })
    const helperPlayerIndex = registerNestedConstructHelper(session, { clay: 3, reed: 1 })

    let response = session.takeAction(0, 'house-redevelopment')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Construct choice')
    const construct = response.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )

    response = session.resolveChoice(0, construct!.value)
    expect(response.interaction.stateId === 'wait' ? {
      kind: response.interaction.request.kind,
      playerIndex: response.interaction.playerIndex,
      sourceCard: response.interaction.sourceCard,
    } : response.interaction).toEqual({
      kind: 'confirm-player-switch',
      playerIndex: helperPlayerIndex,
      sourceCard: undefined,
    })
    const scopes = session.createSessionPrivateCursor().provisionalContinuationScopes
    const parent = scopes.find((scope) => scope.parentScopeId === undefined)
    const child = scopes.find((scope) => scope.parentScopeId !== undefined)
    expect(scopes).toHaveLength(2)
    expect(child?.parentScopeId).toBe(parent?.id)
    expect(parent?.guarded).toBe(true)
    expect(child?.guarded).toBe(false)

    const snapshot = serializeSessionSnapshot(session.state, session)
    expect(snapshot.frame.engineStack.frames).toEqual([])
    const restoredState = rehydrateState(JSON.parse(JSON.stringify(snapshot)))
    const restored = setup({ buildingTycoon: false, clay: 0, reed: 0 })
    registerNestedConstructHelper(restored, { clay: 3, reed: 1 })
    restored.loadState(restoredState.state)
    restored.restoreSessionPrivateCursor(restoredState.sessionCursor!)
    session = restored
    response = session.getState()
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes)
      .toEqual(snapshot.sessionCursor.provisionalContinuationScopes)

    response = advanceSwitches(session, response)
    expect(response.interaction.stateId === 'wait' ? response.interaction.playerIndex : undefined)
      .toBe(helperPlayerIndex)
    response = advanceSwitches(session, session.resolveChoice(helperPlayerIndex, '__skip__'))

    expect(response.state.players[0]).toMatchObject({
      rooms: 2,
      resources: { clay: 2, reed: 1, stone: 2 },
    })
    expect(response.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(1)
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes)
      .toEqual([expect.objectContaining({ id: parent?.id, guarded: true })])
    expect(session.resolveChoice(0, construct!.value).ok).toBe(false)
    expect(response.scores).toHaveLength(2)
  })

  it('rejects a room plan that breaks a guarded Renovate host', () => {
    const session = setup({ buildingTycoon: false, clay: 0, reed: 0, stone: 3 })
    const helperPlayerIndex = registerNestedConstructHelper(session, { clay: 3, reed: 1 })

    let response = session.takeAction(0, 'house-redevelopment')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Construct choice')
    const construct = response.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    response = advanceSwitches(session, session.resolveChoice(0, construct!.value))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected helper choice')
    const accept = response.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    response = advanceSwitches(session, session.resolveChoice(helperPlayerIndex, accept!.value))
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes)
      .toEqual([expect.objectContaining({ guarded: true })])
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
      .toBe('farm-select')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
      throw new Error('expected room selection')
    }
    const room = response.interaction.request.farm.selectableTiles[0]!

    response = session.commitSelectionChoice(0, { rooms: [room] })

    expect(response.ok).toBe(false)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      rooms: 2,
      resources: { clay: 5, reed: 2, stone: 3 },
    })
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
      .toBe('farm-select')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
      throw new Error('expected restored room selection')
    }
    expect(response.interaction.request.farm.selectableTiles).not.toContainEqual(room)
    session.updatePlayerName(0, 'Renamed player')
    response = session.getState()
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
      throw new Error('expected restored room selection after rename')
    }
    expect(response.interaction.request.farm.selectableTiles).not.toContainEqual(room)
    expect(response.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(0)
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes)
      .toEqual([expect.objectContaining({ guarded: true })])
    expect(session.commitSelectionChoice(0, { rooms: [room] }).ok).toBe(false)
    expect(response.scores).toHaveLength(2)
  })

  it('declines the optional Construct after every guarded room plan fails', () => {
    const session = setup({ buildingTycoon: false, clay: 0, reed: 0, stone: 3 })
    const helperPlayerIndex = registerNestedConstructHelper(session, { clay: 3, reed: 1 })

    let response = session.takeAction(0, 'house-redevelopment')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Construct choice')
    const construct = response.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    response = advanceSwitches(session, session.resolveChoice(0, construct!.value))
    if (response.interaction.stateId !== 'wait') throw new Error('expected helper choice')
    const accept = response.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    response = advanceSwitches(session, session.resolveChoice(helperPlayerIndex, accept!.value))

    const rejectedRooms = []
    while (
      response.interaction.stateId === 'wait' &&
      response.interaction.request.kind === 'farm-select'
    ) {
      const room = response.interaction.request.farm.selectableTiles[0]
      if (!room) break
      rejectedRooms.push(room)
      response = session.commitSelectionChoice(0, { rooms: [room] })
    }

    expect(rejectedRooms).toHaveLength(3)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone',
      rooms: 2,
      resources: { clay: 2, reed: 0, stone: 1 },
    })
    expect(response.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(1)
    expect(response.publicEventCancellations?.[0]?.canceledEventIds.length).toBeGreaterThan(0)
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes).toEqual([])
  })

  it('merges a successful child into a successful guarded parent', () => {
    const session = setup({ buildingTycoon: false, clay: 0, reed: 0, stone: 3 })
    const helperPlayerIndex = registerNestedConstructHelper(session, { clay: 3, reed: 2 })

    let response = session.takeAction(0, 'house-redevelopment')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Construct choice')
    const construct = response.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    response = advanceSwitches(session, session.resolveChoice(0, construct!.value))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected helper choice')
    const accept = response.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    response = advanceSwitches(session, session.resolveChoice(helperPlayerIndex, accept!.value))

    expect(session.createSessionPrivateCursor().provisionalContinuationScopes)
      .toEqual([expect.objectContaining({ guarded: true })])
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
      .toBe('farm-select')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
      throw new Error('expected room selection')
    }
    const room = response.interaction.request.farm.selectableTiles[0]!

    response = advanceSwitches(session, session.commitSelectionChoice(0, { rooms: [room] }))
    if (
      response.interaction.stateId === 'wait' &&
      response.interaction.request.kind === 'choice'
    ) {
      response = advanceSwitches(session, session.resolveChoice(0, '__skip__'))
    }

    expect(response.ok).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone',
      rooms: 3,
      resources: { clay: 0, reed: 0, stone: 0 },
    })
    expect(response.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(0)
    expect(response.scores).toHaveLength(2)
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes).toEqual([])
  })

  it('rolls a successful child back with an unguarded parent', () => {
    const session = setup({ buildingTycoon: false, clay: 0, reed: 0, stone: 1 })
    const helperPlayerIndex = registerNestedConstructHelper(session, { clay: 3, reed: 2 })

    let response = session.takeAction(0, 'house-redevelopment')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Construct choice')
    const construct = response.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    response = advanceSwitches(session, session.resolveChoice(0, construct!.value))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected helper choice')
    const accept = response.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    response = advanceSwitches(session, session.resolveChoice(helperPlayerIndex, accept!.value))

    expect(session.createSessionPrivateCursor().provisionalContinuationScopes)
      .toEqual([expect.objectContaining({ guarded: false })])
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
      .toBe('farm-select')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
      throw new Error('expected room selection')
    }
    const room = response.interaction.request.farm.selectableTiles[0]!
    response = advanceSwitches(session, session.commitSelectionChoice(0, { rooms: [room] }))

    expect(response.ok).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      rooms: 2,
      resources: { clay: 2, reed: 1, stone: 1 },
    })
    expect(response.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(1)
    expect(response.scores).toHaveLength(2)
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes).toEqual([])
    expect(session.resolveChoice(0, construct!.value).ok).toBe(false)
  })

  it('blocks unrelated anytime and protected observations under a nested guard', () => {
    const session = setup({ buildingTycoon: false, clay: 3, reed: 1, stone: 1 })
    registerNestedConstructHelper(session, { clay: 0, reed: 0 })
    const anytimeId = registerNoopAnytime(session)
    expect(session.listAnytimeEntries().map((entry) => entry.descriptor.id)).toContain(anytimeId)

    let response = session.takeAction(0, 'house-redevelopment')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Construct choice')
    const construct = response.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    response = session.resolveChoice(0, construct!.value)

    expect(session.createSessionPrivateCursor().provisionalContinuationScopes.map(
      (scope) => scope.guarded,
    )).toEqual([false, true])
    expect(response.interaction.anytimeActions.map((entry) => entry.id)).not.toContain(anytimeId)
    expect(session.takeAnytimeAction(response.interaction.playerIndex, anytimeId).ok).toBe(false)

    const recipient = response.interaction.playerIndex
    const hidden = session.devDrawCard(recipient, 'A001_Shelter')
    expect(hidden.ok).toBe(false)
    expect(hidden.state.players[recipient]!.minorHand).not.toContain('A001_Shelter')
    expect(hidden.privateEvents).toBeUndefined()
    expect(hidden.scores).toHaveLength(2)
    expect(hidden.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(0)
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes.map(
      (scope) => scope.guarded,
    )).toEqual([false, true])
  })

  it('rederives the parent guard from the child checkpoint after child abort', () => {
    const session = setup({ buildingTycoon: false, clay: 0, reed: 0, stone: 1 })
    const helperPlayerIndex = registerNestedConstructHelper(
      session,
      { clay: 3, reed: 1 },
      { stone: 2 },
    )

    let response = session.takeAction(0, 'house-redevelopment')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Construct choice')
    const construct = response.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    response = advanceSwitches(session, session.resolveChoice(0, construct!.value))

    expect(session.createSessionPrivateCursor().provisionalContinuationScopes.map(
      (scope) => scope.guarded,
    )).toEqual([true, false])
    expect(response.interaction.stateId).toBe('wait')

    response = advanceSwitches(session, session.resolveChoice(helperPlayerIndex, '__skip__'))

    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, reed: 1, stone: 1 })
    expect(response.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(1)
    expect(response.scores).toHaveLength(2)
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes)
      .toEqual([expect.objectContaining({ guarded: false })])
  })
})
