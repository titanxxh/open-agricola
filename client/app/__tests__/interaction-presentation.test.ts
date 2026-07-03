import { describe, expect, it } from 'vitest'
import type {
  ActionChoiceOption,
  InteractionAnimalReorgZone,
  InteractionFarmSelection,
  InteractionState,
} from '../../../shared/contract/types'
import type { ClientInteractionState } from '../../../shared/contract/protocol/game'

import {
  buildInteractionPresentationPlan,
  buildInteractionSubmitCommand,
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
      selectionType: 'farm-position',
      selectablePositions: [{ row: 0, col: 0 }],
      maxSelections: 1,
    },
  },
  selection: {
    kind: 'farm-position',
    selectablePositions: [{ row: 0, col: 0 }],
    maxSelections: 1,
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
  farm,
  options: [option('confirm'), option('cancel')],
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
  zones: [reorgZone('pasture-1')],
  allowedCommands: ['resolveChoice', 'undoStep'],
  anytimeActions: [],
})

const waitFeed = (): InteractionState => ({
  stateId: 'wait',
  playerIndex: 1,
  promptKey: 'ui.harvestFeedTitle' as never,
  request: { kind: 'feed', remaining: 2, foodUsed: 1 },
  remaining: 2,
  foodUsed: 1,
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
  nextPlayerIndex: 1,
  allowedCommands: ['resolveChoice'],
  anytimeActions: [],
})

const waitConfirmPlayerSwitch = (): InteractionState => ({
  stateId: 'wait',
  playerIndex: 1,
  promptKey: 'ui.interactionConfirmSwitch' as never,
  request: { kind: 'confirm-player-switch', fromPlayerIndex: 0, toPlayerIndex: 1 },
  fromPlayerIndex: 0,
  toPlayerIndex: 1,
  allowedCommands: ['resolveChoice'],
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
})
