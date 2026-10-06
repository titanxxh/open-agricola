import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { resolveSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { getCardEffect } from '../../shared/cards/card-effects'
import '../../shared/cards/D/D072_StableManure'
import '../../shared/cards/D/D075_WoodField'
import '../../shared/cards/E/E070_CropRotationField'
import '../../shared/cards/E/E080_RockGarden'
import '../../shared/cards/E/E112_GrainThief'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

describe('D072_StableManure session', () => {
  const chooseStableManureSelection = (session: GameSession) => {
    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected choice')

    if (resp.interaction.request.kind === 'select-trigger') {
      const triggerOption = resp.interaction.request.options?.find(
        (o: ActionChoiceOption) => o.value === 'D072_StableManure',
      )
      expect(triggerOption).toBeDefined()
      resp = session.resolveChoice(0, triggerOption!.value)
    }

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected optional choice')

    const acceptOption = resp.interaction.request.options?.find(
      (o: ActionChoiceOption) => o.value !== '__skip__',
    )
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')
    return resp
  }

  const setupHarvest = (unfencedStableCount: number) => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 10
    })

    const player = state.players[0]!
    player.minorPlayed.push('D072_StableManure')

    // Fields with crops
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]

    // One fenced pasture with a stable inside
    // Default rooms are at (2,0) and (1,0) — avoid those for stables/pasture tiles
    player.pastures = [
      {
        id: 'p1',
        size: 2,
        tiles: [{ row: 1, col: 2 }, { row: 1, col: 3 }],
        stables: 1,
        animalType: null,
        animalCount: 0,
      },
    ]

    // Stables: one inside pasture (1,2), rest unfenced
    const stableTiles = [{ row: 1, col: 2 }] // fenced stable (inside pasture)
    for (let i = 0; i < unfencedStableCount; i++) {
      stableTiles.push({ row: 2, col: 2 + i }) // unfenced stables
    }
    player.stableTiles = stableTiles

    session.loadState(state)
    return { session, player: state.players[0]! }
  }

  it('harvests extra crops from selected fields (unfenced stables = 2)', () => {
    const { session } = setupHarvest(2)

    chooseStableManureSelection(session)

    // Select grain at 0-0 and vegetable at 0-1
    const resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 0 }, { row: 0, col: 1 }] })
    expect(resp.ok).toBe(true)

    // Continue through harvest phases
    autoAdvanceRoundEnd(session)

    const p = session.getState().state.players[0]!
    // harvest-extra: gain 1 grain + 1 vegetable from card effect
    // plus normal harvest: 1 grain (0-0) + 1 veg (0-1) + 1 grain (0-2)
    // Total: grain >= 3 (2 from harvest + 1 from card), vegetable >= 2 (1 from harvest + 1 from card)
    expect(p.resources.grain).toBeGreaterThanOrEqual(3)
    expect(p.resources.vegetable).toBeGreaterThanOrEqual(2)
  })

  it('limits selections to unfenced stable count (1 unfenced stable)', () => {
    const { session } = setupHarvest(1)

    chooseStableManureSelection(session)

    const resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 0 }] })
    expect(resp.ok).toBe(true)

    // Continue through harvest
    autoAdvanceRoundEnd(session)

    const p = session.getState().state.players[0]!
    // Extra: 1 grain from card + 2 grain from normal harvest (0-0 and 0-2)
    expect(p.resources.grain).toBeGreaterThanOrEqual(3)
  })

  it('treats Wood Field slots as one field and harvests only one extra wood', () => {
    const { session } = setupHarvest(1)
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = []
    player.resources.wood = 0
    player.minorPlayed.push('D075_WoodField')
    player.cardStates.D075_WoodField = {
      extraData: {
        cardFieldStacks: [
          { crop: 'wood', remaining: 2 },
          { crop: 'wood', remaining: 2 },
        ],
      },
    }
    session.loadState(state)

    const selection = chooseStableManureSelection(session)
    expect(selection.interaction.stateId).toBe('wait')
    if (selection.interaction.stateId !== 'wait') throw new Error('expected selection')
    expect(selection.interaction.request.selection?.selectablePositions).toEqual([
      { row: -1, col: 4076, sourceCard: 'D075_WoodField', groupKey: 'D075_WoodField', cardFieldSlot: 1 },
    ])

    const committed = session.commitSelectionChoice(0, {
      positions: [{ row: -1, col: 4076 }],
    })
    expect(committed.ok).toBe(true)
    autoAdvanceRoundEnd(session)

    const harvested = session.getState().state.players[0]!
    expect(harvested.resources.wood).toBe(3)
    expect(harvested.cardStates.D075_WoodField?.extraData?.cardFieldStacks).toEqual([
      null,
      { crop: 'wood', remaining: 1 },
    ])
    expect(harvested.cardStates.D072_StableManure?.extraData?.selectedPositions).toBeUndefined()
  })

  it('applies Grain Thief selection thresholds to card fields', () => {
    const { session } = setupHarvest(1)
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] }]
    player.occupationPlayed.push('E112_GrainThief')
    player.minorPlayed.push('E070_CropRotationField')
    player.cardStates.E070_CropRotationField = {
      extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] },
    }
    session.loadState(state)

    const selection = chooseStableManureSelection(session)

    expect(selection.interaction.stateId).toBe('wait')
    if (selection.interaction.stateId !== 'wait') throw new Error('expected selection')
    expect(selection.interaction.request.selection?.selectablePositions).toEqual([
      { row: 0, col: 0, groupKey: '0-0' },
      {
        row: -1,
        col: 5070,
        sourceCard: 'E070_CropRotationField',
        groupKey: 'E070_CropRotationField',
        cardFieldSlot: 0,
      },
    ])
  })

  it('treats all Rock Garden slots as one field and harvests only one extra stone', () => {
    const { session } = setupHarvest(1)
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = []
    player.resources.stone = 0
    player.minorPlayed.push('E080_RockGarden')
    player.cardStates.E080_RockGarden = {
      extraData: {
        cardFieldStacks: [
          { crop: 'stone', remaining: 2 },
          { crop: 'stone', remaining: 2 },
          { crop: 'stone', remaining: 2 },
        ],
      },
    }
    session.loadState(state)

    const selection = chooseStableManureSelection(session)
    expect(selection.interaction.stateId === 'wait'
      ? selection.interaction.request.selection?.selectablePositions
      : []).toEqual([{
      row: -1,
      col: 5082,
      sourceCard: 'E080_RockGarden',
      groupKey: 'E080_RockGarden',
      cardFieldSlot: 2,
    }])
    const committed = session.commitSelectionChoice(0, {
      positions: [{ row: -1, col: 5082 }],
    })
    expect(committed.ok).toBe(true)
    autoAdvanceRoundEnd(session)

    const harvested = session.getState().state.players[0]!
    expect(harvested.resources.stone).toBe(4)
    expect(harvested.cardStates.E080_RockGarden?.extraData?.cardFieldStacks).toEqual([
      null,
      { crop: 'stone', remaining: 1 },
      { crop: 'stone', remaining: 1 },
    ])
  })

  it('rejects selecting a normal field and a card field with only one unfenced stable', () => {
    const { session } = setupHarvest(1)
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }]
    player.resources.grain = 0
    player.resources.wood = 0
    player.minorPlayed.push('D075_WoodField')
    player.cardStates.D075_WoodField = {
      extraData: {
        cardFieldStacks: [{ crop: 'wood', remaining: 2 }],
      },
    }
    session.loadState(state)

    chooseStableManureSelection(session)
    const rejected = session.commitSelectionChoice(0, {
      positions: [{ row: 0, col: 0 }, { row: -1, col: 4075 }],
    })

    expect(rejected.ok).toBe(false)
    const unchanged = session.getState().state.players[0]!
    expect(unchanged.resources.grain).toBe(0)
    expect(unchanged.resources.wood).toBe(0)
    expect(unchanged.cardStates.D075_WoodField?.extraData?.cardFieldStacks).toEqual([
      { crop: 'wood', remaining: 2 },
    ])
    expect(unchanged.cardStates.D072_StableManure?.extraData?.selectedPositions).toBeUndefined()
  })

  it('does not trigger when no unfenced stables', () => {
    const { session } = setupHarvest(0)

    const resp = session.performRoundEnd()
    // Should not offer Stable Manure optional
    if (resp.interaction.stateId === 'wait') {
      // If there's a choice, it shouldn't be the Stable Manure optional
      // (it could be another card's choice)
      expect(resp.interaction.promptKey).not.toBe('ui.interactionOptionalAction')
    }
  })

  it('counts the B85 FarmHand stable as unfenced (card-facing count)', () => {
    const { session } = setupHarvest(0)
    const state = session.getState().state
    const p = state.players[0]!
    p.occupationPlayed.push('B085_FarmHand')
    p.cardStates = {
      ...p.cardStates,
      B085_FarmHand: { extraData: { position: { row: 0, col: 0 } } },
    }
    session.loadState(state)

    const effect = getCardEffect('D072_StableManure')
    const flow = effect!.onStartHarvestFieldPhase!(state, p)
    expect(flow).toBeDefined()
  })

  it('does not trigger when no cropped fields', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 10
    })

    const player = state.players[0]!
    player.minorPlayed.push('D072_StableManure')
    player.fields = []
    player.stableTiles = [{ row: 2, col: 0 }]
    player.pastures = []

    session.loadState(state)
    const resp = session.performRoundEnd()
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.promptKey).not.toBe('ui.interactionOptionalAction')
    }
  })
})

describe('D072 Stable Manure parity', () => {
  const CARD_ID = 'D072_StableManure'

  const WOOD_FIELD = 'D075_WoodField'

  const GRAIN_THIEF = 'E112_GrainThief'

  const FILLER = '__test_placeholder__'

  const OCCUPATIONS = ['A100_Curator', 'A125_Priest']

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setup = ({
    played = true, occupations = 0, stableCount = 1, harvest = true,
    fields = [{ kind: 'grain' as const, remaining: 3 }, { kind: 'vegetable' as const, remaining: 2 }],
    woodFieldSlots = [] as number[], grainThief = false,
  }: {
    played?: boolean
    occupations?: number
    stableCount?: number
    harvest?: boolean
    fields?: Array<{ kind: 'grain' | 'vegetable'; remaining: number }>
    woodFieldSlots?: number[]
    grainThief?: boolean
  } = {}) => {
    const session = new GameSession(6072, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 4
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.fields = []
      player.stableTiles = []
      player.pastures = []
      player.cardStates = {}
      player.resources = {
        ...player.resources,
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
      if (harvest) {
        markAllWorkersUsed(state, player)
        setActiveWorkerCount(player, 1)
      } else {
        setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      }
    })

    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.occupationPlayed = OCCUPATIONS.slice(0, occupations)
    if (grainThief) owner.occupationPlayed.push(GRAIN_THIEF)
    owner.fields = fields.map((field, index) => ({
      row: 0, col: index + 2, stacks: field.remaining > 0 ? [{ ...field }] : [],
    }))
    owner.stableTiles = Array.from({ length: stableCount }, (_, index) => ({
      row: 2, col: index + 1,
    }))
    if (woodFieldSlots.length > 0) {
      owner.minorPlayed.push(WOOD_FIELD)
      owner.cardStates[WOOD_FIELD] = {
        extraData: {
          cardFieldStacks: woodFieldSlots.map((remaining) => ({ crop: 'wood', remaining })),
        },
      }
    }
    session.loadState(state)
    return session
  }

  const enterMinorChoice = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    return response
  }

  const playMinor = (session: GameSession) => {
    let response = enterMinorChoice(session)
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const fieldRemaining = (response: SessionResponse, col: number) =>
    response.state.players[0]!.fields.find((field) => field.row === 0 && field.col === col)
      ?.stacks[0]?.remaining ?? 0

  it('D072 S1: at most one occupation allows Stable Manure to be played for free', () => {
    const response = playMinor(setup({ played: false, occupations: 1, harvest: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('D072 S2: two occupations keep Stable Manure unavailable', () => {
    const response = enterMinorChoice(setup({ played: false, occupations: 2, harvest: false }))

    expect(options(response).some((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('D072 S5: the harvest effect may be declined and only normal reaping occurs', () => {
    const session = setup({ stableCount: 2 })
    let response = session.performRoundEnd()
    response = resolveTriggerIfPresent(session, response, CARD_ID)
    response = resolveSkipChoice(session, response)
    response = autoAdvanceRoundEnd(session)

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1 })
    expect(fieldRemaining(response, 2)).toBe(2)
    expect(fieldRemaining(response, 3)).toBe(1)
  })

  it('D072 S7: an ordinary field with only one crop is ineligible for Stable Manure', () => {
    const session = setup({
      stableCount: 1, fields: [{ kind: 'grain', remaining: 1 }],
    })
    let response = session.performRoundEnd()

    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    response = autoAdvanceRoundEnd(session)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(fieldRemaining(response, 2)).toBe(0)
  })
})
