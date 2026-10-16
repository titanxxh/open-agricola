import { payAction } from '../../shared/actions/effects/pay'
import { emptyResources } from '../../shared/session/state-bootstrap'
import { expectWait } from './_helpers/trigger-select'
import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { gainAction } from '../../shared/actions/effects/gain'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { type CardListenerRegistration } from '../../shared/cards/card-listeners'
import { type ActionDefinition, type ActionSpace, type ActionFlow, type ActionChoiceOption, type GameState } from '../../shared/contract/types'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/C/C140_PackagingArtist'
import '../../shared/cards/A/A030_BakingSheet'
import '../../shared/cards/E/E092_FieldDoctor'
import '../../shared/cards/E/E151_DeliveryNurse'
import '../../shared/cards/B/B103_FieldMerchant'
import '../../shared/cards/D/D021_Recruitment'
import '../../shared/cards/A/A097_Freshman'
import '../../shared/cards/A/A094_LazySowman'
import '../../shared/cards/A/A114_SeasonalWorker'
import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/B/B025_BreadPaddle'
import '../../shared/cards/B/B097_Scholar'
import '../../shared/cards/D/D138_PetLover'
import '../../shared/cards/E/E101_Blighter'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, confirmNext, passPreparationExchanges , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const setup = () => {
  const session = sessionEvidence.track(createWorkSession({ seed: 850, options: { playerCount: 2 } }))
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.pastures = []
    player.resources = { ...emptyResources }
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  })
  state.players[0]!.occupationPlayed = ['C140_PackagingArtist']
  state.players[0]!.improvements = ['Major_Fireplace1']
  state.players[0]!.resources.grain = 1
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  expect(expectWait(response).interaction.request.kind).toBe('choice')
  return getChoiceOptions(response) ?? []
}

const registerListener = (session: GameSession, listener: CardListenerRegistration) => {
  session.state.players[0]!.occupationPlayed.push(...listener.cardIds ?? [])
  session.withCtx(() => requireActiveCardRegistry('replacement session test').registerListener(listener))
}

const DYNAMIC_HOST_ID = '__test_replacement_host__'
const registerDynamicAction = (session: GameSession, action: ActionDefinition) => {
  assert.equal(session.state.actionSpaces.some(space => space.id === action.id), false)
  session.state.actionSpaces.push({ ...action, resources: { ...emptyResources }, takenBy: [] } satisfies ActionSpace)
}
const customOpportunity = (session: GameSession, flow: ActionFlow) => {
  registerDynamicAction(session, { id: DYNAMIC_HOST_ID, nameKey: 'actions.forest.name', descriptionKey: 'actions.forest.description',
    roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true, flow,
    execute: () => { throw new Error('The dynamic host must execute its declared flow') } })
  return DYNAMIC_HOST_ID
}



describe('explicit action replacement through GameSession', () => {
  it('blocks a frozen host when only a new replacement becomes doable during before', () => {
    const session = setup()
    const actionId = '__frozen_host__'
    const hostId = customOpportunity(session, { type: 'leaf', actionId, params: { wood: 1 } })
    registerDynamicAction(session, { ...gainAction, id: actionId, canBeExecutedByPlayer: (_state, player) => player.resources.food >= 2 })
    registerListener(session, {
      id: '__late_doability__', cardIds: ['__late_doability__'], actions: [actionId], phases: ['computeReplace', 'isDoable'],
      handler: (context) => {
        if (context.actionContext?.checkedReplaceAction || context.player.resources.food < 1) return
        return context.phase === 'isDoable' ? { doable: true } : {
          decline: true, alternativeFlow: { type: 'leaf', actionId: 'gain', params: { vegetable: 1 } },
        }
      },
    })
    registerListener(session, {
      id: '__host_before__', cardIds: ['__host_before__'], actions: [actionId], phases: ['before'], mandatory: true,
      handler: () => ({ flow: { type: 'leaf', actionId: 'gain', params: { food: 1 } } }),
    })
    const response = session.takeAction(0, hostId)
    expect(response.ok, response.error).toBe(true)
    expect(expectWait(response).interaction.request.kind).toBe('engine-blocked')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0, vegetable: 0 })
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0, vegetable: 0 })
    expect(undone.state.actionSpaces.find((space) => space.id === hostId)!.takenBy).toEqual([])
  })

  it('cannot skip an enabling before trigger using a replacement that appeared after selection', () => {
    const session = setup()
    const actionId = '__strict_payment__'
    const hostId = customOpportunity(session, { type: 'leaf', actionId, params: { cost: { food: 2 } } })
    registerDynamicAction(session, { ...payAction, id: actionId, canBeExecutedByPlayer: (_state, player) => player.resources.food >= 2 })
    registerListener(session, {
      id: '__late_replacement__', cardIds: ['__late_replacement__'], actions: [actionId], phases: ['computeReplace'],
      handler: ({ player }) => player.resources.food > 0 ? {
        decline: true, alternativeFlow: { type: 'leaf', actionId: 'gain', params: { wood: 1 } },
      } : undefined,
    })
    for (const source of ['__first_food__', '__second_food__']) {
      registerListener(session, {
        id: source, cardIds: [source], actions: [actionId], phases: ['before'], mandatory: source === '__first_food__',
        handler: () => ({ flow: { type: 'leaf', actionId: 'gain', params: { food: 1 } } }),
      })
    }
    const offered = session.takeAction(0, hostId)
    expect(expectWait(offered).interaction.request.kind).toBe('select-trigger')
    const pending = session.resolveChoice(0, '__first_food__')
    expect(pending.state.players[0]!.resources.food).toBe(1)
    expect(getChoiceOptions(pending).find((option) => option.value === '__pass__')?.disabled, JSON.stringify(pending.interaction)).toBe(true)
    expect(session.resolveChoice(0, '__pass__').ok).toBe(false)
    const response = session.resolveChoice(0, '__second_food__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0 })
    expect(expectWait(response).interaction.request.kind).toBe('confirm-next-player')
  })

  it('does not guard a frozen payment using a newly available replacement', () => {
    const session = setup()
    const player = session.state.players[0]!
    const hostId = customOpportunity(session, { type: 'leaf', actionId: 'pay', params: { cost: { food: 2 } } })
    registerListener(session, {
      id: '__late_replacement__', cardIds: ['__late_replacement__'], actions: ['pay'], phases: ['computeReplace'],
      handler: ({ player }) => player.resources.food > 0 ? {
        decline: true, alternativeFlow: { type: 'leaf', actionId: 'gain', params: { wood: 1 } },
      } : undefined,
    })
    session.state.players[1]!.occupationPlayed = ['__opponent_before__']
    session.withCtx(() => requireActiveCardRegistry('guard regression').registerListener({
      id: '__opponent_before__', cardIds: ['__opponent_before__'], actions: ['pay'], phases: ['before'], scope: 'opponent', mandatory: true,
      handler: () => ({ flow: { type: 'seq', children: [
        { type: 'leaf', actionId: 'gain', params: { food: 1, recipientPlayerId: player.id } },
        { type: 'leaf', actionId: 'gain', optional: true, params: { wood: 1, recipientPlayerId: player.id } },
      ] } }),
    }))
    let response = session.takeAction(0, hostId)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0 })
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes.map((scope) => scope.guarded)).toEqual([false])
    response = session.resolveChoice(0, 'confirm')
    expect(expectWait(response).interaction.playerIndex).toBe(1)
    response = session.resolveChoice(1, '__skip__')
    expect(response.ok, response.error).toBe(true)
  })

  it.each([false, true])('keeps source labels and producer guards through nested replacements, decline=%s', (decline) => {
    const session = setup()
    const hostId = customOpportunity(session, { type: 'leaf', actionId: 'gain', params: { wood: 10 } })
    for (const [source, resource] of [['__source_A__', 'food'], ['__source_B__', 'reed']] as const) {
      registerListener(session, {
        id: source, cardIds: [source], actions: ['gain'], phases: ['computeReplace'],
        handler: () => ({ decline: true, alternativeFlow: { type: 'leaf', actionId: 'gain', params: { [resource]: 1 } } }),
      })
    }
    const offered = session.takeAction(0, hostId)
    expect(options(offered).filter((option) => option.sourceCard).map((option) => ({
      source: option.sourceCard, gain: option.effectPreview?.kind === 'resourceExchange' ? option.effectPreview.resourcesGained : undefined,
    }))).toEqual([
      { source: '__source_A__', gain: { food: 1 } },
      { source: '__source_B__', gain: { reed: 1 } },
    ])
    expect(offered.state.players[0]!.resources).toMatchObject({ food: 0, reed: 0, wood: 0 })
    const selectedB = session.resolveChoice(0, options(offered).find((option) => option.sourceCard === '__source_B__')!.value)
    expect(options(selectedB).map((option) => option.sourceCard).filter(Boolean)).toEqual(['__source_A__'])
    expect(selectedB.state.players[0]!.resources).toMatchObject({ food: 0, reed: 0, wood: 0 })
    const selected = options(selectedB).find((option) => decline
      ? option.labelKey === 'ui.interactionDoNotReplace' : option.sourceCard === '__source_A__')!
    const response = session.resolveChoice(0, selected.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: decline ? 0 : 1, reed: decline ? 1 : 0, wood: 0 })
    expect(expectWait(response).interaction.request.kind).toBe('confirm-next-player')
  })

  it('keeps the replacement producer distinct from its internal XOR sources after restore', () => {
    const session = setup()
    const hostId = customOpportunity(session, { type: 'leaf', actionId: 'gain', params: { wood: 10 } })
    registerListener(session, {
      id: '__producer__', cardIds: ['__producer__'], actions: ['gain'], phases: ['computeReplace'],
      handler: () => ({ decline: true, alternativeFlow: {
        type: 'xor', promptKey: 'ui.interactionFieldMerchantChoose', children: [
          { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: '__internal_source__' },
          { type: 'leaf', actionId: 'gain', params: { reed: 1 }, sourceCard: '__internal_source__' },
        ],
      } }),
    })
    const offered = session.takeAction(0, hostId)
    expect(options(offered).map((option) => option.sourceCard).filter(Boolean)).toEqual(['__producer__'])
    const cursor = session.createSessionPrivateCursor()
    session.loadState(JSON.parse(JSON.stringify(session.state)))
    session.restoreSessionPrivateCursor(cursor)
    const selected = session.resolveChoice(0, options(session.getState()).find((option) => option.sourceCard === '__producer__')!.value)
    expect(expectWait(selected).interaction.promptKey).toBe('ui.interactionFieldMerchantChoose')
    expect(options(selected).every((option) => option.sourceCard === '__internal_source__')).toBe(true)
    const response = session.resolveChoice(0, options(selected)[0]!.value)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, reed: 0, wood: 0 })
    expect(response.state.events.find((event) => event.type === 'resource.moved' && event.resources.food === 1))
      .toMatchObject({ sourceCardId: '__internal_source__' })
  })

  it('offers the C140 replacement before accepting the optional improvement', () => {
    const session = setup()
    const response = session.takeAction(0, 'meeting-place')

    expect(options(response).some((option) => option.sourceCard === 'C140_PackagingArtist')).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'meeting-place')!.takenBy).toHaveLength(1)
  })

  it('keeps the optional original action skippable after declining replacement', () => {
    const session = setup()
    session.state.players[0]!.minorHand = ['A030_BakingSheet']
    const offered = session.takeAction(0, 'meeting-place')
    const decline = options(offered).find((option) => option.labelKey === 'ui.interactionDoNotReplace')!
    const original = session.resolveChoice(0, decline.value)
    const skip = options(original).find((option) => option.value === '__skip__')!
    const response = session.resolveChoice(0, skip.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorHand).toContain('A030_BakingSheet')
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
  })

  it('waits for an explicit choice when Field Doctor is the only usable replacement', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.occupationPlayed = ['E092_FieldDoctor']
    player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
    player.fields = [[0, 0], [0, 1], [1, 1], [2, 1]].map(([row, col]) => ({ row, col, stacks: [] }))
    const offered = session.takeAction(0, 'wish-children')
    const choices = options(offered)

    expect(choices).toHaveLength(1)
    expect(choices[0]!.sourceCard).toBe('E092_FieldDoctor')
    expect(offered.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(2)
    expect(offered.state.players[0]!.cardStates.E092_FieldDoctor?.flagged).not.toBe(true)

    const response = session.resolveChoice(0, choices[0]!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(3)
    expect(response.state.players[0]!.cardStates.E092_FieldDoctor?.flagged).toBe(true)
  })

  it.each(['food', 'vegetable'] as const)('keeps Field Merchant choices inside its selected source, gaining %s', (resource) => {
    const session = setup()
    session.state.players[0]!.occupationPlayed = ['B103_FieldMerchant']
    session.state.players[0]!.resources.grain = 0
    session.state.availableMajorImprovements = []
    const offered = session.takeAction(0, 'major-improvement')
    expect(options(offered)).toHaveLength(1)
    expect(offered.state.players[0]!.resources[resource]).toBe(0)
    const selected = session.resolveChoice(0, options(offered)[0]!.value)
    expect(expectWait(selected).interaction.promptKey).toBe('ui.interactionFieldMerchantChoose')
    expect(options(selected)).toHaveLength(2)
    const gain = options(selected).find((option) => option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesGained?.[resource] === 1)!
    const response = session.resolveChoice(0, gain.value)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 0, [resource]: 1 })
  })

  it.each(['B103_FieldMerchant', 'C140_PackagingArtist', 'D021_Recruitment', 'original'])('keeps three sources and executes only the chosen %s branch', (chosen) => {
    const session = setup()
    const player = session.state.players[0]!
    player.occupationPlayed.push('B103_FieldMerchant')
    player.minorPlayed.push('D021_Recruitment')
    player.minorHand = ['A030_BakingSheet']
    player.rooms = 3
    let response = session.takeAction(0, 'meeting-place')
    expect(options(response).map((option) => option.sourceCard).filter(Boolean).sort()).toEqual([
      'B103_FieldMerchant', 'C140_PackagingArtist', 'D021_Recruitment',
    ])
    expect(options(response)).toHaveLength(4)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(2)
    const selection = options(response).find((option) => chosen === 'original'
      ? option.labelKey === 'ui.interactionDoNotReplace' : option.sourceCard === chosen)!
    response = session.resolveChoice(0, selection.value)
    if (chosen === 'original') response = session.resolveChoice(0, '__skip__')
    if (chosen === 'C140_PackagingArtist') response = session.resolveChoice(0, 'Major_Fireplace1')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      grain: chosen === 'C140_PackagingArtist' ? 0 : 1,
      food: chosen === 'C140_PackagingArtist' ? 2 : chosen === 'B103_FieldMerchant' ? 1 : 0,
    })
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(chosen === 'D021_Recruitment' ? 3 : 2)
    expect(response.state.players[0]!.minorHand).toContain('A030_BakingSheet')
    const unchosen = ['B103_FieldMerchant', 'C140_PackagingArtist', 'D021_Recruitment'].filter((cardId) => cardId !== chosen)
    expect(response.state.events.some((event) => event.type === 'card.triggered' && unchosen.includes(event.cardId))).toBe(false)
  })

  it('commits Freshman to playing its free occupation without another skip', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.occupationPlayed = ['A097_Freshman']
    player.occupationHand = ['A114_SeasonalWorker']
    player.improvements = []
    player.resources.grain = 0
    const offered = session.takeAction(0, 'grain-utilization')
    const freshman = options(offered).find((option) => option.sourceCard === 'A097_Freshman')!
    expect(freshman).toBeDefined()
    expect(offered.state.players[0]!.occupationHand).toContain('A114_SeasonalWorker')
    const response = session.resolveChoice(0, freshman.value)
    expect(response.state.players[0]!.occupationPlayed).toContain('A114_SeasonalWorker')
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('does not offer a fake Freshman occupation for placeholder hands', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.occupationPlayed = ['A097_Freshman']
    player.improvements = []
    player.resources.grain = 0
    expect(session.getActionAvailability(0)['grain-utilization']).toBe(false)
    const response = session.takeAction(0, 'grain-utilization')
    expect(response.ok).toBe(false)
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy).toEqual([])
  })

  it('does not offer Freshman when Blighter vetoes every occupation choice', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.occupationPlayed = ['A097_Freshman', 'E101_Blighter']
    player.occupationHand = ['A114_SeasonalWorker']
    player.improvements = []
    player.resources.grain = 0
    expect(session.getActionAvailability(0)['grain-utilization']).toBe(false)
    const response = session.takeAction(0, 'grain-utilization')
    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.occupationHand).toEqual(['A114_SeasonalWorker'])
    expect(response.state.players[0]!.cardStates.A097_Freshman?.flagged).not.toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy).toEqual([])
  })


  it.each([false, true])('freezes the selected action before its before trigger and internal pending, decline=%s', (decline) => {
    const session = setup()
    const hostId = customOpportunity(session, { type: 'leaf', actionId: '__replacement_original__', params: { food: 10 } })
    registerDynamicAction(session, { ...gainAction, id: '__replacement_original__' })
    registerDynamicAction(session, {
      ...gainAction, id: '__replacement_choice__',
      execute: () => ({ type: 'request', promptKey: 'ui.interactionFieldMerchantChoose', request: {
        kind: 'choice', options: [{ value: 'grain', labelKey: 'resources.grain' }, { value: 'vegetable', labelKey: 'resources.vegetable' }],
      } }),
      resolveChoice: (context, choice) => gainAction.execute({ ...context, params: { [choice]: 1 } }),
    })
    registerListener(session, {
      id: '__replacement_A__', cardIds: ['__replacement_A__'], actions: ['__replacement_original__'], phases: ['computeReplace'],
      handler: () => ({ decline: true, alternativeFlow: { type: 'leaf', actionId: '__replacement_choice__' } }),
    })
    registerListener(session, {
      id: '__replacement_B__', cardIds: ['__replacement_B__'], actions: ['__replacement_choice__'], phases: ['computeReplace'],
      handler: ({ player }) => player.resources.food > 0
        ? { decline: true, alternativeFlow: { type: 'leaf', actionId: 'gain', params: { vegetable: 10 } } } : undefined,
    })
    for (const [actionId, resource] of [['__replacement_original__', 'wood'], ['__replacement_choice__', 'food']] as const) {
      registerListener(session, {
        id: `__before_${resource}__`, cardIds: [`__before_${resource}__`], actions: [actionId], phases: ['before'], mandatory: true,
        handler: () => ({ flow: { type: 'leaf', actionId: 'gain', params: { [resource]: 1 } } }),
      })
    }
    const offered = session.takeAction(0, hostId)
    expect(options(offered)).toHaveLength(2)
    expect(offered.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0 })
    const selected = options(offered).find((option) => decline
      ? option.labelKey === 'ui.interactionDoNotReplace' : option.sourceCard === '__replacement_A__')!
    let response = session.resolveChoice(0, selected.value)
    if (decline) {
      expect(response.state.players[0]!.resources).toMatchObject({ food: 10, wood: 1, vegetable: 0 })
    } else {
      expect(options(response).map((option) => option.value)).toEqual(['grain', 'vegetable'])
      expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0 })
      response = session.resolveChoice(0, 'grain')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0, grain: 2, vegetable: 0 })
      expect(expectWait(response).interaction.request.kind).toBe('confirm-next-player')
    }
    expect(response.state.events.filter((event) => event.type === 'resource.moved'
      && event.resources[decline ? 'wood' : 'food'] === 1)).toHaveLength(1)
  })


  it('lets a new Sow opportunity replace itself after Lazy Sowman places another worker', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.occupationPlayed = ['A094_LazySowman']
    player.resources.grain = 0
    player.improvements = []
    setActiveWorkerCount(player, 3)
    setWorkersAtHome(session.state, player, 3)
    let response = session.takeAction(0, 'grain-utilization')
    let previousReplacement: string | undefined
    for (const target of ['cultivation', 'day-laborer']) {
      if (expectWait(response).interaction.promptKey !== 'ui.interactionSelectReplacement') {
        const sow = options(response).find((option) => option.labelKey === 'ui.interactionActionOrReplace'
          || option.labelKey === 'actions.sow.name')!
        expect(sow, JSON.stringify(response.interaction)).toBeDefined()
        response = session.resolveChoice(0, sow.value)
      }
      expect(expectWait(response).interaction.promptKey).toBe('ui.interactionSelectReplacement')
      const replacement = options(response).find((option) => option.sourceCard === 'A094_LazySowman')!
      expect(replacement).toBeDefined()
      const choices = options(response)
      const before = JSON.stringify({ state: session.state, cursor: session.createSessionPrivateCursor() })
      session.getState()
      session.getActionAvailability(0)
      expect(JSON.stringify({ state: session.state, cursor: session.createSessionPrivateCursor() })).toBe(before)
      const cursor = session.createSessionPrivateCursor()
      session.loadState(JSON.parse(JSON.stringify(session.state)))
      session.restoreSessionPrivateCursor(cursor)
      expect(options(session.getState())).toEqual(choices)
      if (previousReplacement) {
        expect(session.resolveChoice(0, previousReplacement).ok).toBe(false)
        expect(options(session.getState())).toEqual(choices)
      }
      response = session.resolveChoice(0, replacement.value)
      expect(response.state.players[0]!.resources.food).toBe(0)
      response = session.undoStep()
      expect(options(response)).toEqual(choices)
      expect(JSON.stringify(session.state)).toBe(JSON.stringify(JSON.parse(before).state))
      response = session.resolveChoice(0, replacement.value)
      previousReplacement = replacement.value
      if (options(response).some((option) => option.value === '__skip__')) {
        const place = options(response).find((option) => option.value !== '__skip__')!
        response = session.resolveChoice(0, place.value)
      }
      expect(options(response).some((option) => option.value === 'meeting-place')).toBe(false)
      expect(options(response).some((option) => option.value === target)).toBe(true)
      response = session.resolveChoice(0, target)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[0]!.fields).toEqual([])
    const placed = response.state.actionSpaces.flatMap((space) => space.takenBy.filter((worker) => worker.playerId === player.id))
    expect(new Set(placed.map((worker) => worker.workerId)).size).toBe(3)
  })


  it.each(['undoStep', 'undoAction'] as const)('preserves mandatory replacement payments across reconnect and %s', (undo) => {
    const session = setup()
    session.state.players[0]!.resources.food = 1
    const hostId = customOpportunity(session, { type: 'leaf', actionId: 'gain', params: { wood: 1 } })
    registerListener(session, {
      id: '__pay_replacement__', cardIds: ['__pay_replacement__'], actions: ['gain'], phases: ['computeReplace'],
      handler: () => ({ decline: true, alternativeFlow: { type: 'seq', children: [
        { type: 'leaf', actionId: 'pay', params: { cost: { food: 1 } } },
        { type: 'leaf', actionId: 'pay', params: { cost: { food: 1 } } },
      ] } }),
    })
    const offered = session.takeAction(0, hostId)
    expect(offered.state.players[0]!.resources.food).toBe(1)
    const branch = options(offered).find((option) => option.sourceCard === '__pay_replacement__')!
    let response = session.resolveChoice(0, branch.value)
    expect(expectWait(response).interaction.request.kind).toBe('engine-blocked')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0 })
    const state = JSON.parse(JSON.stringify(session.state))
    const cursor = session.createSessionPrivateCursor()
    session.loadState(state)
    session.restoreSessionPrivateCursor(cursor)
    expect(expectWait(session.getState()).interaction.request.kind).toBe('engine-blocked')
    expect(session.getState().state.players[0]!.resources.food).toBe(0)
    response = session[undo]()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0 })
    if (undo === 'undoStep') expect(expectWait(response).interaction.promptKey).toBe('ui.interactionSelectReplacement')
    else expect(response.state.actionSpaces.find((space) => space.id === hostId)!.takenBy).toEqual([])
  })

  it('retains an explicitly optional child between required replacement effects', () => {
    const session = setup()
    const hostId = customOpportunity(session, { type: 'leaf', actionId: 'gain', params: { wood: 10 } })
    registerListener(session, {
      id: '__optional_replacement__', cardIds: ['__optional_replacement__'], actions: ['gain'], phases: ['computeReplace'],
      handler: () => ({ decline: true, alternativeFlow: { type: 'seq', children: [
        { type: 'leaf', actionId: 'gain', params: { food: 1 } },
        { type: 'leaf', actionId: 'gain', params: { vegetable: 1 }, optional: true },
        { type: 'leaf', actionId: 'gain', params: { reed: 1 } },
      ] } }),
    })
    const offered = session.takeAction(0, hostId)
    const branch = options(offered).find((option) => option.sourceCard === '__optional_replacement__')!
    const selected = session.resolveChoice(0, branch.value)
    expect(options(selected).some((option) => option.value === '__skip__')).toBe(true)
    const response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, vegetable: 0, reed: 1, wood: 0 })
  })

  it('keeps a replacement menu unchanged by queries, invalid input and reconnect', () => {
    let session = setup()
    const response = session.takeAction(0, 'meeting-place')
    const choices = options(response)
    const before = JSON.stringify({ state: session.state, cursor: session.createSessionPrivateCursor() })
    for (let index = 0; index < 3; index++) {
      session.getState()
      session.getActionAvailability(0)
    }
    expect(JSON.stringify({ state: session.state, cursor: session.createSessionPrivateCursor() })).toBe(before)
    expect(session.resolveChoice(1, choices[0]!.value).ok).toBe(false)
    expect(session.resolveChoice(0, '__forged_replacement__').ok).toBe(false)
    expect(options(session.getState())).toEqual(choices)
    const state = JSON.parse(JSON.stringify(session.state))
    const cursor = session.createSessionPrivateCursor()
    session = setup()
    session.loadState(state)
    session.restoreSessionPrivateCursor(cursor)
    expect(options(session.getState())).toEqual(choices)
    expect(session.getState().state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
    const decline = choices.find((option) => option.labelKey === 'ui.interactionDoNotReplace')!
    expect(expectWait(session.resolveChoice(0, decline.value)).interaction.request.kind).toBe('confirm-next-player')
  })

  it.each(['leaf', 'xor'] as const)('preserves a custom replacement target player and space for a root %s', (kind) => {
    const session = setup()
    const hostId = customOpportunity(session, { type: 'leaf', actionId: '__source_gain__', params: { food: 10 } })
    registerDynamicAction(session, { ...gainAction, id: '__source_gain__' })
    const executed: unknown[] = []
    registerDynamicAction(session, { ...gainAction, id: '__observed_replacement_gain__', execute: (context) => {
      executed.push({ playerId: context.player.id, spaceId: context.space.id, sourceCard: context.sourceCard, trueAction: context.actionContext?.trueAction })
      return gainAction.execute(context)
    } })
    const targetId = session.state.players[1]!.id
    const child: ActionFlow = { type: 'leaf', actionId: '__observed_replacement_gain__', params: { wood: 1 }, actionContext: { targetSpaceId: 'day-laborer', trueAction: false } }
    registerListener(session, {
      id: '__target_replacement__', cardIds: ['__target_replacement__'], actions: ['__source_gain__'], phases: ['computeReplace'],
      handler: () => ({ decline: true, alternativeFlow: kind === 'leaf'
        ? { ...child, targetPlayerId: targetId }
        : { type: 'xor', targetPlayerId: targetId, promptKey: 'ui.interactionFieldMerchantChoose', children: [child,
          { ...child, params: { reed: 1 } },
        ] } }),
    })
    const offered = session.takeAction(0, hostId)
    expect(expectWait(offered).interaction.playerIndex).toBe(0)
    expect(offered.state.players[1]!.resources.wood).toBe(0)
    const replacement = options(offered).find((option) => option.sourceCard === '__target_replacement__')!
    let response = session.resolveChoice(0, replacement.value)
    if (expectWait(response).interaction.request.kind === 'confirm-player-switch') response = session.resolveChoice(0, 'confirm')
    if (kind === 'xor') {
      expect(expectWait(response).interaction.playerIndex).toBe(1)
      expect(expectWait(response).interaction.promptKey).toBe('ui.interactionFieldMerchantChoose')
      const gain = options(response).find((option) => option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesGained?.wood === 1)!
      response = session.resolveChoice(1, gain.value)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0 })
    expect(response.state.players[1]!.resources.wood).toBe(1)
    expect(executed).toEqual([{ playerId: targetId, spaceId: 'day-laborer', sourceCard: '__target_replacement__', trueAction: false }])
    const gains = response.state.events.filter((event) => event.type === 'resource.moved' && event.resources.wood === 1)
    expect(gains).toHaveLength(1)
    expect(gains[0]).toMatchObject({ sourceCardId: '__target_replacement__' })
  })


  it('does not attribute an unavailable alternative to the original improvement', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['A030_BakingSheet']
    player.resources.grain = 0
    session.state.availableMajorImprovements = []
    const response = session.takeAction(0, 'major-improvement')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed, JSON.stringify(response.interaction)).toContain('A030_BakingSheet')
    expect(response.state.events.some((event) => event.type === 'card.triggered' && event.cardId === 'C140_PackagingArtist')).toBe(false)
  })

  it('does not reuse Freshman for Bread Paddle during the same turn', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.occupationPlayed = ['A097_Freshman']
    player.occupationHand = ['A114_SeasonalWorker', 'A116_WoodCutter']
    player.minorPlayed = ['B025_BreadPaddle']
    player.improvements = []
    player.resources.grain = 0
    const offered = session.takeAction(0, 'grain-utilization')
    const source = options(offered).find((option) => option.sourceCard === 'A097_Freshman')!
    const selected = session.resolveChoice(0, source.value)
    expect(options(selected).map((option) => option.value)).toEqual(expect.arrayContaining(['A114_SeasonalWorker', 'A116_WoodCutter']))
    let response = session.resolveChoice(0, 'A114_SeasonalWorker')
    expect(expectWait(response).interaction.request.kind).toBe('select-trigger')
    const breadPaddle = getChoiceOptions(response)!.find((option) => option.sourceCard === 'B025_BreadPaddle')
    expect(breadPaddle).toBeUndefined()
    expect(getChoiceOptions(response).find(option => option.value === '__pass__')?.disabled).toBe(true)
    expect(getChoiceOptions(response)!.find((option) => option.sourceCard === 'A097_Freshman')).toBeDefined()
    response = session.resolveChoice(0, 'A097_Freshman')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('A114_SeasonalWorker')
    expect(response.state.players[0]!.occupationHand).toContain('A116_WoodCutter')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(expectWait(response).interaction.request.kind, JSON.stringify(response.interaction)).toBe('confirm-next-player')
  })

  it.each(['E092_FieldDoctor', 'E151_DeliveryNurse'])('offers both no-room growth sources and consumes only %s', (chosen) => {
    const session = setup()
    const player = session.state.players[0]!
    player.occupationPlayed = ['E092_FieldDoctor', 'E151_DeliveryNurse']
    player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
    player.fields = [[0, 0], [0, 1], [1, 1], [2, 1]].map(([row, col]) => ({ row, col, stacks: [] }))
    Object.assign(player.resources, { sheep: 1, boar: 1, cattle: 1 })
    player.pastures = [{ row: 0, col: 2 }, { row: 0, col: 4 }, { row: 2, col: 4 }].map((tile, index) => ({ id: `pasture-${index}`, tiles: [tile], animalType: (['sheep', 'boar', 'cattle'] as const)[index]!, animalCount: 1 }))
    const offered = session.takeAction(0, 'wish-children')
    expect(options(offered).map((option) => option.sourceCard).sort()).toEqual(['E092_FieldDoctor', 'E151_DeliveryNurse'])
    expect(offered.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(2)
    const source = options(offered).find((option) => option.sourceCard === chosen)!
    const response = session.resolveChoice(0, source.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(3)
    expect(response.state.players[0]!.cardStates[chosen]?.flagged).toBe(true)
    const unchosen = chosen === 'E092_FieldDoctor' ? 'E151_DeliveryNurse' : 'E092_FieldDoctor'
    expect(response.state.players[0]!.cardStates[unchosen]?.flagged).not.toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1, cattle: 1 })
  })


  it.each([false, true])('keeps Pet Lover supply animals separate from its market, replace=%s', (replace) => {
    const session = setup()
    const player = session.state.players[0]!
    player.occupationPlayed = ['D138_PetLover']
    player.resources.grain = 0
    player.improvements = []
    player.pastures = [{ id: 'pasture-0', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 }]
    session.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 1
    const offered = session.takeAction(0, 'sheep-market')
    expect(options(offered)).toHaveLength(2)
    expect(offered.state.players[0]!.resources.sheep).toBe(0)
    const selected = options(offered).find((option) => replace ? option.sourceCard === 'D138_PetLover' : option.labelKey === 'ui.interactionDoNotReplace')!
    let response = session.resolveChoice(0, selected.value)
    if (expectWait(response).interaction.request.kind === 'animal-reorg') {
      response = session.resolveChoice(0, 'confirm', { zones: [{ id: 'pasture-0', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 }] })
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, grain: replace ? 1 : 0, food: replace ? 3 : 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep).toBe(replace ? 1 : 0)
  })

  it('offers a replacement whose mandatory before can fund its current payment', () => {
    const session = setup()
    const hostId = customOpportunity(session, { type: 'leaf', actionId: '__original_food__', params: { food: 10 } })
    registerDynamicAction(session, { ...gainAction, id: '__original_food__' })
    registerListener(session, {
      id: '__enabling_replace__', cardIds: ['__enabling_replace__'], actions: ['__original_food__'], phases: ['computeReplace'],
      handler: () => ({ decline: true, alternativeFlow: { type: 'leaf', actionId: 'pay', params: { cost: { food: 1 } } } }),
    })
    registerListener(session, {
      id: '__enabling_before__', cardIds: ['__enabling_before__'], actions: ['pay'], phases: ['before'], mandatory: true,
      handler: () => ({ flow: { type: 'leaf', actionId: 'gain', params: { food: 1 } } }),
    })
    const offered = session.takeAction(0, hostId)
    expect(offered.state.players[0]!.resources.food).toBe(0)
    const replacement = options(offered).find((option) => option.sourceCard === '__enabling_replace__')!
    expect(replacement).toBeDefined()
    const response = session.resolveChoice(0, replacement.value)
    expect(response.ok, response.error).toBe(true)
    expect(expectWait(response).interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.events.filter((event) => event.type === 'resource.paid' && event.resources.food === 1)).toHaveLength(1)
  })

  it('does not use Field Merchant to replace the non-action improvement granted by Scholar', () => {
    const session = setup()
    session.state.round = 5
    session.state.players.forEach((player) => setWorkersAtHome(session.state, player, 0))
    const player = session.state.players[0]!
    player.occupationPlayed = ['B097_Scholar', 'B103_FieldMerchant']
    player.houseType = 'stone'
    player.improvements = []
    player.resources.grain = 0
    player.minorHand = ['A030_BakingSheet']
    let response = session.performRoundEnd()
    expect(response.state.round).toBe(6)
    if (expectWait(response).interaction.request.kind === 'select-trigger') response = session.resolveChoice(0, 'B097_Scholar')
    const improvement = options(response).find((option) => option.value !== '__skip__')!
    expect(options(response).some((option) => option.sourceCard === 'B103_FieldMerchant')).toBe(false)
    response = session.resolveChoice(0, improvement.value)
    if (!response.state.players[0]!.minorPlayed.includes('A030_BakingSheet')) {
      expect(expectWait(response).interaction.promptKey).toBe('ui.interactionChooseImprovement')
      expect(options(response).map((option) => option.value)).toEqual(['A030_BakingSheet'])
      response = session.resolveChoice(0, 'A030_BakingSheet')
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed, JSON.stringify(response.interaction)).toContain('A030_BakingSheet')
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

})

describe("A097 command boundaries", () => {
    const FRESH = 'A097_Freshman';
    const OCC = 'A114_SeasonalWorker';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response; }
    function setup(configure: (state: GameState) => void = () => { }, round = 14, played = true) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = round;
                for (const player of state.players)
                    Object.assign(player.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                state.players[0]!.occupationPlayed = played ? [FRESH] : [];
                state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [FRESH];
                configure(state);
            } }));
        return session;
    }
    function ready(session: GameSession, actor: number) {
        let response = session.getState();
        if (response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'confirm-next-player')
            response = confirmNext(session, response);
        assert.equal(response.interaction.stateId, 'idle', JSON.stringify(response.interaction));
        assert.equal(response.state.currentPlayerIndex, actor);
    }
    function turn(session: GameSession, actor: number, space: string) { ready(session, actor); return ok(session.takeAction(actor, space)); }
    function options(response: SessionResponse): ActionChoiceOption[] { assert.ok(response.interaction.stateId === 'wait', JSON.stringify(response.interaction)); assert.ok('options' in expectWait(response).interaction.request); return getChoiceOptions(response)!; }
    function replacement(session: GameSession, response: SessionResponse, card: string) { const choice = options(response).find(o => o.sourceCard === card); assert.ok(choice, JSON.stringify(response.interaction)); return ok(session.resolveChoice(0, choice.value)); }
    it("grainless Bake replacement plays occupation free and rejects other actor and unknown card", () => {
        const session = setup(state => { state.players[0]!.occupationHand = [OCC, 'A116_WoodCutter']; state.players[0]!.resources.food = 0; });
        let response = replacement(session, turn(session, 0, 'grain-utilization'), FRESH);
        assertRejectedUnchanged(session, () => session.resolveChoice(1, OCC));
        assertRejectedUnchanged(session, () => session.resolveChoice(0, 'does-not-exist'));
        response = ok(session.resolveChoice(0, OCC));
        assert.equal(response.state.players[0]!.resources.food, 0);
        assert.ok(response.state.players[0]!.occupationPlayed.includes(OCC));
        assert.ok(response.state.players[0]!.occupationHand.includes('A116_WoodCutter'));
        save('A097-N1', response);
    });
    it("no playable occupation or unplayed Freshman cannot make grainless space available", () => {
        for (const session of [setup(), setup(state => state.players[0]!.occupationHand = [OCC], 14, false)]) {
            assert.equal(session.getActionAvailability(0)['grain-utilization'], false);
            const response = assertRejectedUnchanged(session, () => session.takeAction(0, 'grain-utilization'));
            save(`A097-N2-${response.state.players[0]!.occupationPlayed.length}`, response);
        }
    });
    it("Bread Paddle cannot reuse Freshman within the same placement", () => {
        const session = setup(state => { state.players[0]!.occupationHand = [OCC, 'A116_WoodCutter']; state.players[0]!.minorPlayed = ['B025_BreadPaddle']; state.players[0]!.resources.food = 0; });
        let response = replacement(session, turn(session, 0, 'grain-utilization'), FRESH);
        response = ok(session.resolveChoice(0, OCC));
        assert.equal(response.interaction.stateId === 'wait' ? expectWait(response).interaction.request.kind : '', 'select-trigger');
        const paddle = options(response).find(o => o.sourceCard === 'B025_BreadPaddle');
        assert.equal(paddle, undefined);
        assert.equal(options(response).find(option => option.value === '__pass__')?.disabled, true);
        save('A097-N3-before-remaining-trigger', response);
        response = ok(session.resolveChoice(0, FRESH));
        assert.ok(response.state.players[0]!.occupationHand.includes('A116_WoodCutter'));
        assert.equal(response.state.players[0]!.resources.food, 0);
        assert.equal(response.interaction.stateId === 'wait' ? expectWait(response).interaction.request.kind : '', 'confirm-next-player');
        save('A097-N3', response);
    });
    it("Blighter veto cannot be bypassed by a free occupation replacement", () => {
        const session = setup(state => { state.players[0]!.occupationPlayed.push('E101_Blighter'); state.players[0]!.occupationHand = [OCC]; });
        assert.equal(session.getActionAvailability(0)['grain-utilization'], false);
        const response = assertRejectedUnchanged(session, () => session.takeAction(0, 'grain-utilization'));
        assert.ok(response.state.players[0]!.occupationHand.includes(OCC));
        save('A097-N4', response);
    });
});
