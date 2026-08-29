import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A132_Publican'
import '../../shared/cards/A/A065_SeedPellets'
import '../../shared/cards/A/A094_LazySowman'
import '../../shared/cards/D/D114_SeedTrader'
import '../../shared/cards/D/D025_WitchesDanceFloor'
import type { ActionChoiceOption, ActionDefinition } from '../../shared/contract/types'
import { rollAndCacheCardPick } from '../../shared/cards/helpers/card-random'
import type { SessionResponse } from '../../shared/session/session-core'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

describe('A132_Publican session', () => {
  const setup = (currentPlayerIndex: number) => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 1
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'grain-utilization'

    // P0 is the Publican owner
    const owner = state.players[0]!
    owner.occupationPlayed.push('A132_Publican')
    owner.resources.grain = 3

    // P1 (opponent) needs plowed fields and grain to sow
    const opponent = state.players[1]!
    opponent.resources.grain = 2
    opponent.fields = [
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 1, stacks: [] },
    ]

    session.loadState(state)
    return session
  }

  const setupMultipleHelpers = () => {
    const session = new GameSession(undefined, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 2
    state.round = 1
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'grain-utilization'
    for (const owner of state.players.slice(0, 2)) {
      owner.occupationPlayed.push('A132_Publican')
      owner.resources.grain = 1
    }
    state.players[2]!.resources.grain = 0
    state.players[2]!.fields = [{ row: 0, col: 0, stacks: [] }]
    session.loadState(state)
    return session
  }

  const advancePastPlayerSwitches = (session: GameSession, resp: SessionResponse) => {
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }
    return resp
  }

  const registerRandomAnytime = (
    session: GameSession,
    id: string,
    makeSowReachable: boolean,
  ) => {
    const action: ActionDefinition = {
      id,
      nameKey: 'actions.test.name',
      descriptionKey: 'actions.test.description',
      roundAvailable: 1,
      gainPerRound: {},
      anytime: true,
      canBeExecutedByPlayer: () => true,
      execute: ({ state, player, reportProtectedObservation }) => {
        rollAndCacheCardPick(
          state,
          player,
          '__TEST_protected_observation__',
          id,
          ['left', 'right'],
          reportProtectedObservation,
        )
        if (makeSowReachable) state.players[1]!.resources.grain += 1
        return { type: 'ok' }
      },
    }
    ;(session as unknown as { registry: { register: (definition: ActionDefinition) => void } })
      .registry.register(action)
  }

  const registerNoopAnytime = (session: GameSession, id: string) => {
    const action: ActionDefinition = {
      id,
      nameKey: 'actions.test.name',
      descriptionKey: 'actions.test.description',
      roundAvailable: 1,
      gainPerRound: {},
      anytime: true,
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'request',
        request: {
          kind: 'choice',
          options: [
            { value: 'left', labelKey: 'ui.interactionConfirm' },
            { value: 'right', labelKey: 'ui.interactionConfirm' },
          ],
        },
      }),
      resolveChoice: () => ({ type: 'ok' }),
    }
    ;(session as unknown as { registry: { register: (definition: ActionDefinition) => void } })
      .registry.register(action)
  }

  it('publican can pay 1 grain for 1 VP when opponent sows', () => {
    const session = setup(1)
    const s = session.getState().state
    const ownerGrainBefore = s.players[0]!.resources.grain
    const opponentGrainBefore = s.players[1]!.resources.grain

    // Opponent (p1) takes grain-utilization
    // Since opponent can sow but can't bake bread, sow auto-selects
    // Before-sow opponent listener fires, creating PlayerSwitch to owner
    let resp = session.takeAction(1, 'grain-utilization')
    expect(resp.ok).toBe(true)

    // If it's a choice (sow/bake-bread), pick sow
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionGrainUtilizationChoice') {
      const sowOption = resp.interaction.request.options?.find(
        (o: ActionChoiceOption) => o.labelKey === 'actions.sow.name' || o.value === 'sow',
      )
      if (sowOption) {
        resp = session.resolveChoice(1, sowOption.value)
      }
    }

    // Walk past player switches to reach Publican's optional choice
    resp = advancePastPlayerSwitches(session, resp)

    // The optional flow should present a choice to accept or skip
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const acceptOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)

    // Walk through any remaining player switches back to opponent for sow
    resp = advancePastPlayerSwitches(session, resp)

    // Now the sow farm interaction should be presented for opponent
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined).toBe('ui.interactionSowSelect')

    // Commit the sow with 1 grain crop
    resp = session.commitSelectionChoice(1, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    resp = advancePastPlayerSwitches(session, resp)

    const after = session.getState().state
    // Owner lost 1 grain
    expect(after.players[0]!.resources.grain).toBe(ownerGrainBefore - 1)
    // Opponent: started with 2, gained 1 from Publican, sowed 1 = 2
    expect(after.players[1]!.resources.grain).toBe(opponentGrainBefore + 1 - 1)
    // Owner should have 1 bonus VP
    expect(after.players[0]!.cardStates?.A132_Publican?.counters?.bonusVp).toBe(1)
  })

  it('makes sow reachable when the opponent needs Publican grain', () => {
    const session = setup(1)
    const state = session.getState().state
    state.players[1]!.resources.grain = 0
    session.loadState(state)

    let resp = session.takeAction(1, 'grain-utilization')
    expect(resp.ok).toBe(true)
    resp = advancePastPlayerSwitches(session, resp)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Publican choice')
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.sourceCard).toBe('A132_Publican')

    const acceptOption = resp.interaction.request.options.find((option) => option.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)
    resp = advancePastPlayerSwitches(session, resp)

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined).toBe('ui.interactionSowSelect')

    resp = session.commitSelectionChoice(1, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.grain).toBe(2)
    expect(after.players[0]!.cardStates?.A132_Publican?.counters?.bonusVp).toBe(1)
    expect(after.players[1]!.resources.grain).toBe(0)
    expect(after.players[1]!.fields[0]!.stacks[0]?.kind).toBe('grain')
    expect(resp.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(0)
    expect(resp.scores).toHaveLength(2)
  })

  it('makes a grain-capable card field reachable with Publican grain', () => {
    const session = setup(1)
    const state = session.getState().state
    const opponent = state.players[1]!
    opponent.resources.grain = 0
    opponent.fields = []
    opponent.minorPlayed.push('D025_WitchesDanceFloor')
    session.loadState(state)

    let resp = advancePastPlayerSwitches(session, session.takeAction(1, 'grain-utilization'))
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined)
      .toBe('A132_Publican')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Publican choice')
    const accept = resp.interaction.request.options.find((option) => option.value !== '__skip__')

    resp = advancePastPlayerSwitches(session, session.resolveChoice(0, accept!.value))

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select') {
      throw new Error('expected Sow selection')
    }
    expect(resp.interaction.request.farm).toEqual(expect.objectContaining({
      farmType: 'sow',
      selectableFields: [expect.objectContaining({
        sourceCard: 'D025_WitchesDanceFloor',
        allowedCrops: expect.arrayContaining(['grain']),
      })],
    }))
  })

  it('rejects random and hidden observations before Sow is guarded', () => {
    const session = setup(1)
    const state = session.getState().state
    state.players[1]!.resources.grain = 0
    session.loadState(state)
    registerRandomAnytime(session, 'card___TEST_random_failure', false)

    let resp = advancePastPlayerSwitches(session, session.takeAction(1, 'grain-utilization'))
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined)
      .toBe('A132_Publican')
    const rngTick = resp.state.rngTick

    resp = session.takeAnytimeAction(1, 'card___TEST_random_failure')
    expect(resp.ok).toBe(false)
    expect(resp.state.rngTick).toBe(rngTick)
    expect(resp.state.players[1]!.cardStates.__TEST_protected_observation__).toBeUndefined()
    expect(resp.privateEvents).toBeUndefined()
    expect(session.takeAnytimeAction(1, 'card___TEST_random_failure').ok).toBe(false)

    resp = session.devDrawCard(1, 'A001_Shelter')
    expect(resp.ok).toBe(false)
    expect(resp.state.players[1]!.minorHand).not.toContain('A001_Shelter')
    expect(resp.privateEvents).toBeUndefined()
    expect(session.devDrawCard(1, 'A001_Shelter').ok).toBe(false)
    expect(resp.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(0)
    expect(resp.scores).toHaveLength(2)
  })

  it('commits protected observations after the Sow continuation is guarded', () => {
    const session = setup(1)
    const state = session.getState().state
    state.players[1]!.resources.grain = 0
    session.loadState(state)
    registerRandomAnytime(session, 'card___TEST_random_success', true)

    let resp = advancePastPlayerSwitches(session, session.takeAction(1, 'grain-utilization'))
    resp = session.takeAnytimeAction(1, 'card___TEST_random_success')

    expect([resp.ok, resp.error]).toEqual([true, undefined])
    expect(resp.state.players[1]!.resources.grain).toBe(1)
    expect(resp.state.players[1]!.cardStates.__TEST_protected_observation__?.extraData)
      .toHaveProperty('card___TEST_random_success')
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes)
      .toEqual([expect.objectContaining({ guarded: true })])
    expect(resp.interaction.anytimeActions.map((action) => action.id))
      .not.toContain('card___TEST_random_success')
    expect(session.takeAnytimeAction(1, 'card___TEST_random_success').ok).toBe(false)

    const rejected = session.devSetResources(1, { grain: 0 })
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[1]!.resources.grain).toBe(1)
    expect(session.devSetResources(1, { grain: 0 }).ok).toBe(false)

    const hidden = session.devDrawCard(1, 'A001_Shelter')
    expect(hidden.ok).toBe(true)
    expect(hidden.state.players[1]!.minorHand).toContain('A001_Shelter')

    const ownerId = hidden.state.players[1]!.id
    const opponentId = hidden.state.players[0]!.id
    expect(session.buildSyncPayload(hidden, ownerId, 'viewer').privateEvents)
      .toEqual([expect.objectContaining({ cardIds: ['A001_Shelter'] })])
    expect(JSON.stringify(session.buildSyncPayload(hidden, opponentId, 'viewer')))
      .not.toContain('A001_Shelter')
    expect(JSON.stringify(session.buildSyncPayload(hidden, null, 'viewer')))
      .not.toContain('A001_Shelter')

    resp = advancePastPlayerSwitches(session, session.resolveChoice(0, '__skip__'))
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionSowSelect')
    expect(resp.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(0)
    expect(resp.scores).toHaveLength(2)
  })

  it('shares one scope across multiple Publican helpers until one accepts', () => {
    const session = setupMultipleHelpers()
    let resp = advancePastPlayerSwitches(session, session.takeAction(2, 'grain-utilization'))

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.playerIndex : undefined).toBe(0)
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes).toHaveLength(1)

    resp = advancePastPlayerSwitches(session, session.resolveChoice(0, '__skip__'))
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.playerIndex : undefined).toBe(1)
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes).toHaveLength(1)

    if (resp.interaction.stateId !== 'wait') throw new Error('expected second Publican choice')
    const accept = resp.interaction.request.options.find((option) => option.value !== '__skip__')
    resp = session.resolveChoice(1, accept!.value)
    resp = advancePastPlayerSwitches(session, resp)

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionSowSelect')
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[1]!.resources.grain).toBe(0)
    expect(resp.state.players[1]!.cardStates.A132_Publican?.counters?.bonusVp).toBe(1)
    expect(resp.state.players[2]!.resources.grain).toBe(1)
    expect(resp.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(0)
    expect(resp.scores).toHaveLength(3)
  })

  it('aborts a shared Publican scope once after every helper declines', () => {
    const session = setupMultipleHelpers()
    let resp = advancePastPlayerSwitches(session, session.takeAction(2, 'grain-utilization'))
    resp = advancePastPlayerSwitches(session, session.resolveChoice(0, '__skip__'))
    resp = advancePastPlayerSwitches(session, session.resolveChoice(1, '__skip__'))

    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.players.map((player) => player.resources.grain)).toEqual([1, 1, 0])
    expect(resp.state.log.filter((entry) => entry.key === 'log.provisionalContinuationRollback'))
      .toHaveLength(1)
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes).toEqual([])
    expect(session.takeAction(2, 'grain-utilization').ok).toBe(false)
    expect(resp.scores).toHaveLength(3)
  })

  it('restores the action when Publican declines the grain needed to sow', () => {
    const session = setup(1)
    const state = session.getState().state
    state.players[1]!.resources.grain = 0
    session.loadState(state)

    let resp = session.takeAction(1, 'grain-utilization')
    resp = advancePastPlayerSwitches(session, resp)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Publican choice')
    expect(resp.interaction.sourceCard).toBe('A132_Publican')

    resp = session.resolveChoice(0, '__skip__')
    resp = advancePastPlayerSwitches(session, resp)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.players[0]!.resources.grain).toBe(3)
    expect(resp.state.players[1]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.cardStates?.A132_Publican?.counters?.bonusVp).toBeUndefined()
    expect(resp.state.actionSpaces.find((space) => space.id === 'grain-utilization')?.takenBy).toEqual([])
    expect(resp.actionAvailability?.['grain-utilization']).toBe(false)
    expect(resp.state.log.filter((entry) => entry.key === 'log.provisionalContinuationRollback')).toHaveLength(1)
    expect(resp.scores).toHaveLength(2)

    const retry = session.takeAction(1, 'grain-utilization')
    expect(retry.ok).toBe(false)
    expect(retry.interaction.stateId).toBe('idle')
  })

  it('preserves the Publican guard when undo would make Sow unreachable again', () => {
    const session = setup(1)
    const state = session.getState().state
    const opponent = state.players[1]!
    opponent.resources.grain = 0
    opponent.resources.food = 2
    opponent.occupationPlayed.push('D114_SeedTrader')
    opponent.cardStates.D114_SeedTrader = {
      counters: { grain: 1, vegetable: 0 },
      extraData: {},
    }
    session.loadState(state)

    let resp = advancePastPlayerSwitches(session, session.takeAction(1, 'grain-utilization'))
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined)
      .toBe('A132_Publican')
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes)
      .toMatchObject([{ guarded: false }])

    resp = session.takeAnytimeAction(1, 'D114-seed-trader-anytime')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[1]!.resources).toMatchObject({ food: 0, grain: 1 })
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes)
      .toMatchObject([{ guarded: true }])

    resp = session.undoStep()
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('command would break a mandatory continuation')
    expect(resp.state.players[1]!.resources).toMatchObject({ food: 0, grain: 1 })
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes)
      .toMatchObject([{ guarded: true }])

    resp = advancePastPlayerSwitches(session, session.resolveChoice(0, '__skip__'))
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionSowSelect')
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes).toEqual([])
  })

  it('rederives a failed Sow only after a material anytime action', () => {
    const session = setup(1)
    const state = session.getState().state
    const opponent = state.players[1]!
    opponent.resources.grain = 0
    opponent.resources.food = 2
    opponent.occupationPlayed.push('D114_SeedTrader')
    opponent.cardStates.D114_SeedTrader = {
      counters: { grain: 1, vegetable: 0 },
      extraData: {},
    }
    session.loadState(state)

    let resp = session.takeAction(1, 'grain-utilization')
    resp = advancePastPlayerSwitches(session, resp)
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, '__skip__')
    resp = advancePastPlayerSwitches(session, resp)
    expect(resp.actionAvailability?.['grain-utilization']).toBe(false)

    expect(session.devSetResources(1, { grain: 0 }).ok).toBe(true)
    expect(session.takeAction(1, 'grain-utilization').ok).toBe(false)

    resp = session.takeAnytimeAction(1, 'D114-seed-trader-anytime')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[1]!.resources).toMatchObject({ food: 0, grain: 1 })
    expect(resp.state.players[1]!.cardStates.D114_SeedTrader?.counters?.grain).toBe(0)

    resp = session.takeAction(1, 'grain-utilization')
    expect(resp.ok).toBe(true)
    resp = advancePastPlayerSwitches(session, resp)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe('A132_Publican')
    expect(resp.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(1)
    expect(resp.scores).toHaveLength(2)
  })

  it('retains failed Sow memory across a multi-step no-op anytime flow', () => {
    const session = setup(1)
    const state = session.getState().state
    state.players[1]!.resources.grain = 0
    session.loadState(state)
    registerNoopAnytime(session, '__TEST_noop_anytime__')

    let resp = advancePastPlayerSwitches(session, session.takeAction(1, 'grain-utilization'))
    expect(resp.interaction.stateId).toBe('wait')
    resp = advancePastPlayerSwitches(session, session.resolveChoice(0, '__skip__'))
    expect(resp.interaction.stateId).toBe('idle')
    expect(session.createSessionPrivateCursor().failedAuthoritativeCommands).toHaveLength(1)

    resp = session.takeAnytimeAction(1, '__TEST_noop_anytime__')
    expect(resp.interaction.stateId).toBe('wait')
    expect(session.createSessionPrivateCursor().failedAuthoritativeCommands).toHaveLength(1)

    resp = session.resolveChoice(1, 'left')
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.players[1]!.resources.grain).toBe(0)
    expect(session.createSessionPrivateCursor().failedAuthoritativeCommands).toHaveLength(1)
    expect(session.takeAction(1, 'grain-utilization').ok).toBe(false)
    expect(resp.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(1)
    expect(resp.scores).toHaveLength(2)
  })

  it('restores an active scope and its failure memory from the private cursor', () => {
    const session = setup(1)
    const state = session.getState().state
    state.players[1]!.resources.grain = 0
    session.loadState(state)

    let resp = advancePastPlayerSwitches(session, session.takeAction(1, 'grain-utilization'))
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe('A132_Publican')

    const snapshot = serializeSessionSnapshot(session.state, session)
    expect(snapshot.frame.engineStack.frames).toEqual([])
    expect(JSON.stringify(snapshot.frame)).not.toContain('provisionalContinuationScopes')
    expect(snapshot.sessionCursor.provisionalContinuationScopes).toHaveLength(1)

    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    resp = restored.getState()
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe('A132_Publican')

    resp = advancePastPlayerSwitches(restored, restored.resolveChoice(0, '__skip__'))
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.actionAvailability?.['grain-utilization']).toBe(false)
    expect(resp.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(1)
    expect(resp.scores).toHaveLength(2)

    const failedSnapshot = serializeSessionSnapshot(restored.state, restored)
    const failedRestored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(failedSnapshot))))
    expect(failedRestored.takeAction(1, 'grain-utilization').ok).toBe(false)
  })

  it('publican can decline the optional exchange', () => {
    const session = setup(1)
    const s = session.getState().state
    const ownerGrainBefore = s.players[0]!.resources.grain

    // Opponent (p1) takes grain-utilization → sow auto-selects
    let resp = session.takeAction(1, 'grain-utilization')
    expect(resp.ok).toBe(true)

    // If it's a choice, pick sow
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionGrainUtilizationChoice') {
      const sowOption = resp.interaction.request.options?.find(
        (o: ActionChoiceOption) => o.labelKey === 'actions.sow.name' || o.value === 'sow',
      )
      if (sowOption) {
        resp = session.resolveChoice(1, sowOption.value)
      }
    }

    // Walk past player switches
    resp = advancePastPlayerSwitches(session, resp)

    // The optional flow should present a choice
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Decline
    resp = session.resolveChoice(0, '__skip__')

    resp = advancePastPlayerSwitches(session, resp)

    // Now sow farm interaction for opponent
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined).toBe('ui.interactionSowSelect')

    resp = session.commitSelectionChoice(1, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    resp = advancePastPlayerSwitches(session, resp)

    const after = session.getState().state
    // Owner resources unchanged
    expect(after.players[0]!.resources.grain).toBe(ownerGrainBefore)
    // No bonus VP
    expect(after.players[0]!.cardStates?.A132_Publican?.counters?.bonusVp).toBeUndefined()
  })

  it('offers Publican after the opponent selects original sow from Lazy Sowman', () => {
    const session = setup(1)
    const state = session.getState().state
    state.players[1]!.occupationPlayed.push('A094_LazySowman')
    session.loadState(state)

    let resp = session.takeAction(1, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const sowOption = resp.interaction.request.options.find(
      (option) => option.labelKey === 'actions.sow.name',
    )
    expect(sowOption).toBeDefined()

    resp = session.resolveChoice(1, sowOption!.value)
    resp = advancePastPlayerSwitches(session, resp)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.sourceCard).toBe('A132_Publican')
    expect(resp.interaction.request.options.map((option) => option.value)).toContain('__skip__')
  })

  it('rechecks sow after Seed Pellets gives the opponent grain', () => {
    const session = setup(1)
    const state = session.getState().state
    state.players[1]!.resources.grain = 0
    state.players[1]!.minorPlayed.push('A065_SeedPellets')
    session.loadState(state)

    let resp = session.takeAction(1, 'grain-utilization')
    expect(resp.ok).toBe(true)
    resp = advancePastPlayerSwitches(session, resp)

    expect(resp.state.players[1]!.resources.grain).toBe(1)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.sourceCard).toBe('A132_Publican')
  })

  it('does not trigger when owner takes sow themselves', () => {
    const session = setup(0)

    // Give owner fields to sow
    const state = session.getState().state
    state.players[0]!.fields = [
      { row: 0, col: 0, stacks: [] },
    ]
    session.loadState(state)

    const grainBefore = session.getState().state.players[0]!.resources.grain

    // Owner (p0) takes grain-utilization → sow auto-selects
    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)

    // If it's a choice, pick sow
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionGrainUtilizationChoice') {
      const sowOption = resp.interaction.request.options?.find(
        (o: ActionChoiceOption) => o.labelKey === 'actions.sow.name' || o.value === 'sow',
      )
      if (sowOption) {
        resp = session.resolveChoice(0, sowOption.value)
      }
    }

    // No PlayerSwitch should happen for own sow
    resp = advancePastPlayerSwitches(session, resp)

    // Should go directly to sow interaction
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined).toBe('ui.interactionSowSelect')

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    resp = advancePastPlayerSwitches(session, resp)

    const after = session.getState().state
    // No bonus VP should be gained (owner sowed, not opponent)
    expect(after.players[0]!.cardStates?.A132_Publican?.counters?.bonusVp).toBeUndefined()
    // Owner should only have lost grain from sowing
    expect(after.players[0]!.resources.grain).toBe(grainBefore - 1)
  })
})
