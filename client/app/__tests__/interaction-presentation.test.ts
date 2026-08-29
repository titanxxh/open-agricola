import { describe, expect, it } from 'vitest'
import type {
  ActionChoiceOption,
  InteractionAnimalReorgZone,
  InteractionFarmSelection,
  InteractionState,
  ResourceBatchExchangePayload,
} from '../../../shared/contract/types'
import type { ClientInteractionState } from '../../../shared/contract/protocol/game'
import { authoritativeCommandKey } from '../../../shared/contract/authoritative-command'

import {
  buildInteractionPresentationPlan,
  buildInteractionSubmitCommand,
  interactionChoiceOptions,
} from '../interaction-presentation'

const option = (value: string, labelKey = value): ActionChoiceOption => ({
  value,
  labelKey,
})

const waitChoice = (
  options: ActionChoiceOption[],
  promptKey = 'ui.interactionChooseOne',
): InteractionState => ({
  stateId: 'wait',
  playerIndex: 0,
  promptKey: promptKey as never,
  request: { kind: 'choice', options },
  options,
  allowedCommands: ['resolveChoice', 'undoStep'],
  anytimeActions: [],
})

const waitSelection = (): InteractionState => ({
  stateId: 'wait',
  playerIndex: 1,
  promptKey: 'ui.interactionSelection' as never,
  request: {
    kind: 'selection',
    selection: {
      kind: 'farm-position',
      selectablePositions: [{ row: 0, col: 0 }],
      maxSelections: 1,
    },
    options: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }],
  },
  allowedCommands: ['commitSelection', 'undoStep'],
  anytimeActions: [],
})

const waitOccupationHandSelection = (): InteractionState => ({
  stateId: 'wait',
  playerIndex: 1,
  promptKey: 'ui.interactionSelection' as never,
  request: {
    kind: 'selection',
    selection: {
      kind: 'occupation-hand',
      selectableCards: ['A001_Farmer'],
      minSelections: 1,
      maxSelections: 1,
    },
  },
  allowedCommands: ['commitSelection', 'undoStep'],
  anytimeActions: [],
})

const waitFarm = (farm: InteractionFarmSelection): InteractionState => ({
  stateId: 'wait',
  playerIndex: 0,
  promptKey: `ui.interaction${farm.farmType}` as never,
  request: {
    kind: 'farm-select',
    farm,
    options: [option('confirm'), option('cancel')],
  },
  allowedCommands: ['commitSelection', 'undoStep'],
  anytimeActions: [],
})

const reorgZone = (id: string): InteractionAnimalReorgZone => ({
  id,
  zoneType: 'pasture',
  animalType: 'sheep',
  animalCount: 1,
  capacity: 2,
})

const waitAnimalReorg = (): InteractionState => ({
  stateId: 'wait',
  playerIndex: 0,
  promptKey: 'ui.interactionReorgAnimalsTitle' as never,
  request: {
    kind: 'animal-reorg',
    zones: [reorgZone('pasture-1')],
  },
  allowedCommands: ['resolveChoice', 'undoStep'],
  anytimeActions: [],
})

const waitFeed = (): InteractionState => ({
  stateId: 'wait',
  playerIndex: 1,
  promptKey: 'ui.harvestFeedTitle' as never,
  request: { kind: 'feed', remaining: 2, foodUsed: 1 },
  allowedCommands: ['resolveChoice', 'undoStep'],
  anytimeActions: [],
})

const waitHeating = (): InteractionState => ({
  stateId: 'wait',
  playerIndex: 0,
  promptKey: 'ui.heatingTitle' as never,
  request: {
    kind: 'heating',
    playerId: 'p1',
    required: 2,
    maxFuelPayable: 1,
    maxWoodConvertibleToFuel: 1,
  },
  allowedCommands: ['resolveChoice', 'undoStep'],
  anytimeActions: [],
})

const waitConfirmNextPlayer = (): InteractionState => ({
  stateId: 'wait',
  playerIndex: 0,
  promptKey: 'ui.interactionConfirmNextPlayer' as never,
  request: { kind: 'confirm-next-player', nextPlayerIndex: 1 },
  allowedCommands: ['resolveChoice'],
  anytimeActions: [],
})

const waitConfirmPlayerSwitch = (): InteractionState => ({
  stateId: 'wait',
  playerIndex: 1,
  promptKey: 'ui.interactionConfirmSwitch' as never,
  request: { kind: 'confirm-player-switch', fromPlayerIndex: 0, toPlayerIndex: 1 },
  allowedCommands: ['resolveChoice'],
  anytimeActions: [],
})

const waitEngineBlocked = (): InteractionState => ({
  stateId: 'wait',
  playerIndex: 0,
  promptKey: 'ui.interactionChooseOne' as never,
  request: {
    kind: 'engine-blocked',
    actionId: 'test-action',
    reasonKey: 'ui.interactionChooseOne' as never,
  },
  allowedCommands: ['undoStep'],
  anytimeActions: [],
})

const waitResourceQuantity = (): InteractionState => ({
  stateId: 'wait',
  playerIndex: 0,
  promptKey: 'ui.interactionChooseOne' as never,
  request: {
    kind: 'resource-quantity-select',
    cardId: 'B157_Salter',
    availableByResource: { sheep: 2 },
    promptKey: 'ui.interactionChooseOne' as never,
    requireAtLeastOne: true,
  },
  allowedCommands: ['commitSelection', 'undoStep'],
  anytimeActions: [],
})

const batchPayload: ResourceBatchExchangePayload = {
  discard: { food: 1 },
  receive: { wood: 1 },
}

const waitResourceBatchExchange = (): InteractionState => ({
  stateId: 'wait',
  playerIndex: 1,
  promptKey: 'ui.interactionChooseOne' as never,
  request: {
    kind: 'resource-batch-exchange-select',
    cardId: 'E078_SleightOfHand',
    discardAvailableByResource: { food: 2 },
    receiveResources: ['wood'],
    maxTotal: 1,
    promptKey: 'ui.interactionChooseOne' as never,
  },
  allowedCommands: ['commitSelection', 'undoStep'],
  anytimeActions: [],
})

const waitCardDraft = (): InteractionState => ({
  stateId: 'wait',
  playerIndex: 0,
  promptKey: 'ui.interactionChooseOne' as never,
  request: {
    kind: 'card-draft',
    mode: 'simultaneous',
    round: 1,
    totalRounds: 7,
    poolSize: 7,
    seatOrder: ['p1', 'p2'],
    pools: {},
    pendingPicks: [],
    kept: {},
  },
  allowedCommands: [],
  anytimeActions: [],
})

describe('Interaction Presentation', () => {
  it('routes generic choice waits to the choice bar surface', () => {
    const plan = buildInteractionPresentationPlan(waitChoice([option('take-wood')]))

    expect(plan.kind).toBe('choice-bar')
    if (plan.kind !== 'choice-bar') return
    expect(plan.pendingChoice.options.map((entry) => entry.value)).toEqual(['take-wood'])
    expect(plan.suppressChoiceOptions).toBe(false)
  })

  it('routes exchange choice waits to the exchange center surface', () => {
    const plan = buildInteractionPresentationPlan(
      waitChoice([option('trade:1:1'), option('cancel')], 'ui.interactionExchangeChoice'),
    )

    expect(plan.kind).toBe('exchange-center')
    if (plan.kind !== 'exchange-center') return
    expect(plan.pendingChoice.options.map((entry) => entry.value)).toEqual(['trade:1:1', 'cancel'])
  })

  it('routes Moor special-action choices to the card hot-zone surface', () => {
    const plan = buildInteractionPresentationPlan(waitChoice([
      option('card-action:moor-special-cut-peat:action:cut-peat'),
    ]))

    expect(plan.kind).toBe('moor-special-action')
    if (plan.kind !== 'moor-special-action') return
    expect(plan.pendingChoice.options).toHaveLength(1)
    expect(plan.choices.isActive).toBe(true)
    expect(plan.suppressChoiceOptions).toBe(true)
  })

  it('does not expose redacted private prompts as public interaction surfaces', () => {
    const redacted: ClientInteractionState = {
      stateId: 'wait',
      playerIndex: 1,
      promptKey: 'ui.interactionChooseOne' as never,
      request: {
        kind: 'private-prompt',
        playerIndex: 1,
        promptKind: 'choice',
        promptKey: 'ui.interactionChooseOne',
      },
      allowedCommands: [],
      anytimeActions: [],
    }

    expect(buildInteractionPresentationPlan(redacted)).toEqual({ kind: 'none' })
  })

  it('routes farm waits to farm-specific board selection plans', () => {
    expect(buildInteractionPresentationPlan(waitFarm({
      farmType: 'fence',
      selectableEdges: ['H-0-0'],
    })).kind).toBe('farm-fence-selection')
    expect(buildInteractionPresentationPlan(waitFarm({
      farmType: 'room',
      selectableTiles: [{ row: 0, col: 0 }],
      maxSelections: 1,
    })).kind).toBe('farm-room-selection')
    expect(buildInteractionPresentationPlan(waitFarm({
      farmType: 'stable',
      selectableTiles: [{ row: 0, col: 0 }],
      maxSelections: 1,
    })).kind).toBe('farm-stable-selection')
    expect(buildInteractionPresentationPlan(waitFarm({
      farmType: 'plow',
      selectableTiles: [{ row: 0, col: 0 }],
    })).kind).toBe('farm-plow-selection')
    expect(buildInteractionPresentationPlan(waitFarm({
      farmType: 'sow',
      selectableFields: [{ tile: { row: 0, col: 0 }, allowedCrops: ['grain'] }],
    })).kind).toBe('farm-sow-selection')
  })

  it('routes farm-position waits to the position selection plan', () => {
    const plan = buildInteractionPresentationPlan(waitSelection())

    expect(plan.kind).toBe('position-selection')
    if (plan.kind !== 'position-selection') return
    expect(plan.selection.selectablePositions).toEqual([{ row: 0, col: 0 }])
    expect(plan.pendingChoice.options.map((entry) => entry.value)).toEqual(['confirm'])
  })

  it('routes every in-scope wait request kind to an explicit presentation plan', () => {
    expect(buildInteractionPresentationPlan(waitChoice([option('take-wood')])).kind).toBe('choice-bar')
    expect(buildInteractionPresentationPlan({
      ...waitChoice([option('trigger')]),
      request: { kind: 'select-trigger', ownerPlayerId: 'p1', options: [option('trigger')] },
    }).kind).toBe('choice-bar')
    expect(buildInteractionPresentationPlan(waitAnimalReorg()).kind).toBe('animal-reorg')
    expect(buildInteractionPresentationPlan(waitConfirmNextPlayer()).kind).toBe('confirm-next-player')
    expect(buildInteractionPresentationPlan(waitConfirmPlayerSwitch()).kind).toBe('confirm-player-switch')
    expect(buildInteractionPresentationPlan(waitFeed()).kind).toBe('harvest-feed')
    expect(buildInteractionPresentationPlan(waitHeating()).kind).toBe('heating')
    expect(buildInteractionPresentationPlan(waitOccupationHandSelection()).kind).toBe('occupation-hand-selection')
    expect(buildInteractionPresentationPlan(waitEngineBlocked()).kind).toBe('engine-blocked')
    expect(buildInteractionPresentationPlan(waitResourceQuantity()).kind).toBe('resource-quantity-select')
    expect(buildInteractionPresentationPlan(waitResourceBatchExchange()).kind).toBe('resource-batch-exchange-select')
    expect(buildInteractionPresentationPlan(waitCardDraft()).kind).toBe('card-draft')
  })

  it('builds a commitSelection command for position selection drafts', () => {
    expect(buildInteractionSubmitCommand(waitSelection(), {
      value: 'confirm',
      positionSelectionKeys: ['0-0'],
    })).toEqual({
      kind: 'commitSelection',
      playerIndex: 1,
      payload: { positions: [{ row: 0, col: 0 }] },
    })
  })

  it('builds commitSelection commands for farm selection drafts', () => {
    expect(buildInteractionSubmitCommand(waitFarm({
      farmType: 'room',
      selectableTiles: [{ row: 1, col: 1 }],
      maxSelections: 1,
    }), {
      value: 'confirm',
      roomTiles: [{ row: 1, col: 1 }],
    })).toEqual({
      kind: 'commitSelection',
      playerIndex: 0,
      payload: { rooms: [{ row: 1, col: 1 }] },
    })

    expect(buildInteractionSubmitCommand(waitFarm({
      farmType: 'fence',
      selectableEdges: ['H-0-0'],
      extraWood: 1,
      fenceSource: { kind: 'borrowed', donorCaps: { p2: 1 } },
    }), {
      value: 'confirm',
      fenceEdges: ['H-0-0'],
      palisadeEdges: ['V-0-0'],
      fenceSources: { 'H-0-0': 'p2' },
    })).toEqual({
      kind: 'commitSelection',
      playerIndex: 0,
      payload: {
        edges: ['H-0-0'],
        palisadeEdges: ['V-0-0'],
        extraWood: 1,
        fenceSources: { 'H-0-0': 'p2' },
      },
    })

    expect(buildInteractionSubmitCommand(waitFarm({
      farmType: 'plow',
      selectableTiles: [{ row: 0, col: 1 }],
    }), {
      value: 'confirm',
      plowTile: { row: 0, col: 1 },
    })).toEqual({
      kind: 'commitSelection',
      playerIndex: 0,
      payload: { tile: { row: 0, col: 1 } },
    })

    expect(buildInteractionSubmitCommand(waitFarm({
      farmType: 'sow',
      selectableFields: [
        { tile: { row: 0, col: 0 }, allowedCrops: ['grain'] },
        { tile: { row: 0, col: 1 }, allowedCrops: ['vegetable'] },
      ],
    }), {
      value: 'confirm',
      sowSelections: { '0-0': 'grain', '0-1': 'vegetable' },
    })).toEqual({
      kind: 'commitSelection',
      playerIndex: 0,
      payload: {
        crops: [
          { row: 0, col: 0, crop: 'grain' },
          { row: 0, col: 1, crop: 'vegetable' },
        ],
      },
    })
  })

  it('returns local farm errors instead of submitting incomplete farm drafts', () => {
    expect(buildInteractionSubmitCommand(waitFarm({
      farmType: 'stable',
      selectableTiles: [{ row: 1, col: 0 }],
      maxSelections: 1,
    }), { value: 'confirm' })).toEqual({
      kind: 'localFarmError',
      farmType: 'stable',
      error: 'NO_SELECTION',
    })

    expect(buildInteractionSubmitCommand(waitFarm({
      farmType: 'plow',
      selectableTiles: [{ row: 0, col: 1 }],
    }), { value: 'confirm' })).toEqual({
      kind: 'localFarmError',
      farmType: 'plow',
      error: 'NO_SELECTION',
    })

    expect(buildInteractionSubmitCommand(waitFarm({
      farmType: 'sow',
      selectableFields: [{ tile: { row: 0, col: 0 }, allowedCrops: ['grain'] }],
    }), { value: 'confirm' })).toEqual({
      kind: 'localFarmError',
      farmType: 'sow',
      error: 'NO_SELECTION',
    })

    expect(buildInteractionSubmitCommand(waitFarm({
      farmType: 'fence',
      selectableEdges: ['H-0-0'],
      fenceSource: { kind: 'borrowed', donorCaps: { p2: 1 } },
    }), {
      value: 'confirm',
      fenceEdges: ['H-0-0'],
    })).toEqual({
      kind: 'localFarmError',
      farmType: 'fence',
      error: {
        code: 'BORROWED_FENCE_SOURCE_REQUIRED',
        edges: ['H-0-0'],
        newEdges: ['H-0-0'],
      },
    })
  })

  it('builds resolveChoice commands for animal reorg and heating drafts', () => {
    const zones = [reorgZone('pasture-1'), reorgZone('house')]

    expect(buildInteractionSubmitCommand(waitAnimalReorg(), {
      value: 'confirm',
      animalReorgZones: zones,
    })).toEqual({
      kind: 'resolveChoice',
      playerIndex: 0,
      value: 'confirm',
      payload: { zones },
    })

    expect(buildInteractionSubmitCommand(waitHeating(), {
      value: 'confirm',
      heatingPayment: { fuelUsed: 2, woodToFuel: 1 },
    })).toEqual({
      kind: 'resolveChoice',
      playerIndex: 0,
      value: 'confirm',
      payload: { fuelUsed: 2, woodToFuel: 1 },
    })
  })

  it('builds feed and handoff submit commands', () => {
    const selections = [{
      count: 1,
      sourceId: 'C109_SchnappsDistiller',
      sourceName: 'Schnapps Distiller',
      exchangeIndex: 0,
    }]

    expect(buildInteractionSubmitCommand(waitFeed(), {
      value: 'confirm',
      feedSelections: selections,
    })).toEqual({
      kind: 'confirmFeed',
      playerIndex: 1,
      selections,
    })
    expect(buildInteractionSubmitCommand(waitConfirmNextPlayer(), { value: 'confirm' })).toEqual({
      kind: 'confirmNextPlayer',
    })
    expect(buildInteractionSubmitCommand(waitConfirmPlayerSwitch(), { value: 'confirm' })).toEqual({
      kind: 'confirmPlayerSwitch',
    })
  })

  it('builds commitSelection commands for resource and occupation-hand drafts', () => {
    expect(buildInteractionSubmitCommand(waitOccupationHandSelection(), {
      value: 'confirm',
      occupationCardIds: ['A001_Farmer'],
    })).toEqual({
      kind: 'commitSelection',
      playerIndex: 1,
      payload: { cardIds: ['A001_Farmer'] },
    })
    expect(buildInteractionSubmitCommand(waitResourceQuantity(), {
      value: 'confirm',
      resourceCounts: { sheep: 1 },
    })).toEqual({
      kind: 'commitSelection',
      playerIndex: 0,
      payload: { resourceCounts: { sheep: 1 } },
    })
    expect(buildInteractionSubmitCommand(waitResourceBatchExchange(), {
      value: 'confirm',
      resourceBatchExchange: batchPayload,
    })).toEqual({
      kind: 'commitSelection',
      playerIndex: 1,
      payload: { resourceBatchExchange: batchPayload },
    })
  })

  it('rejects exact failed choice and selection submissions across interaction kinds', () => {
    const choice = waitChoice([option('blocked'), option('available')])
    if (choice.stateId !== 'wait') throw new Error('expected wait interaction')
    choice.rejectedCommandKeys = [authoritativeCommandKey('choice', 0, { value: 'blocked' })]
    expect(interactionChoiceOptions(choice)).toEqual([
      { ...option('blocked'), disabled: true },
      option('available'),
    ])
    expect(buildInteractionSubmitCommand(choice, { value: 'blocked' })).toEqual({ kind: 'rejected' })

    const submissions = [
      {
        interaction: waitSelection(),
        draft: { value: 'confirm', positionSelectionKeys: ['0-0'] },
        playerIndex: 1,
        payload: { positions: [{ row: 0, col: 0 }] },
      },
      {
        interaction: waitFarm({ farmType: 'fence', selectableEdges: ['H-0-0'] }),
        draft: { value: 'confirm', fenceEdges: ['H-0-0'] },
        playerIndex: 0,
        payload: { edges: ['H-0-0'], palisadeEdges: [], extraWood: 0 },
      },
      {
        interaction: waitFarm({
          farmType: 'stable',
          selectableTiles: [{ row: 1, col: 0 }],
          maxSelections: 1,
        }),
        draft: { value: 'confirm', stableTiles: [{ row: 1, col: 0 }] },
        playerIndex: 0,
        payload: { stables: [{ row: 1, col: 0 }] },
      },
      {
        interaction: waitFarm({
          farmType: 'sow',
          selectableFields: [{ tile: { row: 0, col: 0 }, allowedCrops: ['grain'] }],
        }),
        draft: { value: 'confirm', sowSelections: { '0-0': 'grain' as const } },
        playerIndex: 0,
        payload: { crops: [{ row: 0, col: 0, crop: 'grain' }] },
      },
    ]

    for (const submission of submissions) {
      if (submission.interaction.stateId !== 'wait') throw new Error('expected wait interaction')
      submission.interaction.rejectedCommandKeys = [authoritativeCommandKey(
        'commitSelection',
        submission.playerIndex,
        submission.payload,
      )]
      expect(buildInteractionSubmitCommand(submission.interaction, submission.draft))
        .toEqual({ kind: 'rejected' })
    }
  })
})
