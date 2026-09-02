import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { reap } from '../../shared/actions/effects/reap'
import { fieldIsEmpty } from '../../shared/domain/field'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import type { ActionFlow } from '../../shared/contract/types'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C006_StoneClearing'
import '../../shared/cards/D/D063_Lynchet'
import '../../shared/cards/D/D075_WoodField'
import '../../shared/cards/A/A011_MudPatch'
import '../../shared/cards/C/C070_LettucePatch'
import '../../shared/cards/E/E068_CherryOrchard'
import '../../shared/cards/E/E069_MelonPatch'
import '../../shared/cards/E/E070_CropRotationField'
import '../../shared/cards/E/E072_ArtichokeField'

const CARD_ID = 'C006_StoneClearing'

const buyStoneClearing = (
  session: GameSession,
  response: ReturnType<GameSession['takeAction']>,
) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  let cardPrompt = response
  if (!cardPrompt.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const improvementOption = cardPrompt.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'),
    )
    expect(improvementOption).toBeDefined()
    cardPrompt = session.resolveChoice(0, improvementOption!.value)
    expect(cardPrompt.ok).toBe(true)
    if (cardPrompt.interaction.stateId !== 'wait') return cardPrompt
  }
  if (cardPrompt.state.players[1]!.minorHand.includes(CARD_ID)) return cardPrompt
  const cardOption = cardPrompt.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(cardOption).toBeDefined()
  return session.resolveChoice(0, cardOption!.value)
}

const setupPublic = ({ planted = false, cardField = false } = {}) => {
  const session = new GameSession(6, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 4
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 20
  })
  const owner = state.players[0]!
  owner.minorHand = [CARD_ID]
  owner.resources.stone = 0
  owner.fields = planted
    ? [
        { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
        { row: 1, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
      ]
    : [
        { row: 0, col: 2, stacks: [] },
        { row: 1, col: 2, stacks: [] },
        { row: 2, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
      ]
  if (cardField) {
    owner.fields = []
    owner.minorPlayed.push('D075_WoodField')
    owner.cardStates.D075_WoodField = { extraData: { cardFieldStacks: [null, null] } }
  }
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession) => {
  let response: SessionResponse = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'),
  )
  if (!improvement) return response
  response = session.resolveChoice(0, improvement.value)
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (!card) return response
  return session.resolveChoice(0, card.value)
}

describe('C006 Stone Clearing parity', () => {
  it('C006 S1: Stone Clearing places one stone on each empty field but skips planted fields', () => {
    const response = playMinor(setupPublic())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 19, stone: 0 })
    expect(response.state.players[0]!.fields.map((field) => field.stacks)).toEqual([
      [{ kind: 'stone', remaining: 1 }],
      [{ kind: 'stone', remaining: 1 }],
      [{ kind: 'grain', remaining: 2 }],
    ])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('C006 S2: the next field phase harvests one stone from each marked field', () => {
    const session = setupPublic()
    const played = playMinor(session)
    played.state.players.forEach((player) => markAllWorkersUsed(played.state, player))
    session.loadState(played.state)

    const response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.stone).toBe(2)
    expect(response.state.players[0]!.fields.slice(0, 2).every(fieldIsEmpty)).toBe(true)
  })

  it('C006 S3: no empty fields places no stone but still pays and passes', () => {
    const response = playMinor(setupPublic({ planted: true }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 19, stone: 0 })
    expect(response.state.players[0]!.fields.every((field) => field.stacks[0]?.kind === 'grain')).toBe(true)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('C006 S4: an empty Wood Field card receives exactly one stone as one logical field', () => {
    const response = playMinor(setupPublic({ cardField: true }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates.D075_WoodField?.extraData?.cardFieldStacks).toEqual([
      { crop: 'stone', remaining: 1 },
      null,
    ])
    expect(response.state.players[0]!.resources.stone).toBe(0)
  })
})
describe('C006_StoneClearing session (reference-aligned)', () => {
  const setupWithFields = (fields: Array<{ row: number; col: number; stacks: Array<{ kind: 'grain' | 'vegetable' | 'stone'; remaining: number }> }>) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    for (const participant of state.players) {
      participant.minorHand = ['__test_placeholder__']
      participant.occupationHand = ['__test_placeholder__']
    }
    const player = state.players[0]!
    player.minorPlayed.push('C006_StoneClearing')
    player.fields = fields
    session.loadState(state)
    return session
  }

  it('fills an empty farm field and D75 slot through a real 2-player purchase', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    for (const participant of state.players) {
      participant.minorHand = ['__test_placeholder__']
      participant.occupationHand = ['__test_placeholder__']
    }
    const player = state.players[0]!
    player.minorHand = [CARD_ID]
    player.occupationPlayed = ['__test_occupation__']
    player.minorPlayed.push('D075_WoodField')
    player.cardStates.D075_WoodField = { extraData: { cardFieldStacks: [null, null] } }
    player.fields = [{ row: 1, col: 0, stacks: [] }]
    player.resources.food = 1
    session.loadState(state)

    const response = buyStoneClearing(session, session.takeAction(0, 'meeting-place'))

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'stone', remaining: 1 }])
    expect(response.state.players[0]!.cardStates.D075_WoodField.extraData?.cardFieldStacks).toEqual([
      { crop: 'stone', remaining: 1 },
      null,
    ])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('onBuy returns no leaf and does not grant stone immediately', () => {
    const session = setupWithFields([
      { row: 1, col: 0, stacks: [] },
      { row: 1, col: 1, stacks: [] },
      { row: 1, col: 2, stacks: [] },
    ])
    const state = session.getState().state
    const player = state.players[0]!
    const beforeStone = player.resources.stone ?? 0

    const flow = runCardEffectHook(state, player, 'C006_StoneClearing', 'onBuy')
    // `runCardEffectHook` coerces `undefined` return to `null` (card-effects.ts:253).
    expect(flow).toBeNull()

    // Stone NOT granted immediately — it lands at next reap.
    expect(player.resources.stone ?? 0).toBe(beforeStone)
  })

  it('onBuy pushes stone stack onto every empty field', () => {
    const session = setupWithFields([
      { row: 1, col: 0, stacks: [] },
      { row: 1, col: 1, stacks: [] },
      { row: 1, col: 2, stacks: [] },
    ])
    const state = session.getState().state
    const player = state.players[0]!

    runCardEffectHook(state, player, 'C006_StoneClearing', 'onBuy')

    for (const f of player.fields) {
      expect(f.stacks).toEqual([{ kind: 'stone', remaining: 1 }])
      expect(fieldIsEmpty(f)).toBe(false)
    }
  })

  it('onBuy skips empty fields when player has none', () => {
    const session = setupWithFields([])
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'C006_StoneClearing', 'onBuy')
    expect(flow).toBeNull()
    expect(player.fields).toEqual([])
  })

  it('onBuy does not stone-fill fields that already have crops', () => {
    const session = setupWithFields([
      { row: 1, col: 0, stacks: [] },
      { row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 1, col: 2, stacks: [] },
    ])
    const state = session.getState().state
    const player = state.players[0]!

    runCardEffectHook(state, player, 'C006_StoneClearing', 'onBuy')

    expect(player.fields[0]!.stacks).toEqual([{ kind: 'stone', remaining: 1 }])
    expect(player.fields[1]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    expect(player.fields[2]!.stacks).toEqual([{ kind: 'stone', remaining: 1 }])
  })

  it('reap after C6 onBuy grants 1 stone per stone-bearing field and clears them', () => {
    const session = setupWithFields([
      { row: 1, col: 0, stacks: [] },
      { row: 1, col: 1, stacks: [] },
    ])
    const state = session.getState().state
    const player = state.players[0]!
    const beforeStone = player.resources.stone ?? 0

    runCardEffectHook(state, player, 'C006_StoneClearing', 'onBuy')
    expect(player.fields.every((f) => f.stacks[0]?.kind === 'stone')).toBe(true)

    const result = reap(state, player)
    expect(result.type).toBe('ok')
    expect((player.resources.stone ?? 0) - beforeStone).toBe(2)
    expect(player.fields.every(fieldIsEmpty)).toBe(true)
    expect(result.reapSummary.harvestedPositions!.length).toBe(2)
    expect(result.reapSummary.grainFields).toBe(0)
    expect(result.reapSummary.vegetableFields).toBe(0)
    expect(result.reapSummary.resources.stone).toBe(2)
  })

  it('mixed grain + stone fields reap into both resources, grainFields counts only grain', () => {
    const session = setupWithFields([
      { row: 1, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 1, col: 1, stacks: [] },
      { row: 1, col: 2, stacks: [] },
    ])
    const state = session.getState().state
    const player = state.players[0]!
    const beforeGrain = player.resources.grain ?? 0
    const beforeStone = player.resources.stone ?? 0

    runCardEffectHook(state, player, 'C006_StoneClearing', 'onBuy')
    const result = reap(state, player)

    expect((player.resources.grain ?? 0) - beforeGrain).toBe(1)
    expect((player.resources.stone ?? 0) - beforeStone).toBe(2)
    expect(result.reapSummary.grainFields).toBe(1)
    expect(result.reapSummary.vegetableFields).toBe(0)
    expect(result.reapSummary.resources.stone).toBe(2)
    expect(result.reapSummary.harvestedPositions!.length).toBe(3)
  })

  it('places stone on an eligible empty Card Field without changing planted fields', () => {
    const session = setupWithFields([
      { row: 1, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
    ])
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push('B113_PatchCaregiver')
    player.cardStates.B113_PatchCaregiver = {}
    const eventCount = state.events.length

    runCardEffectHook(state, player, 'C006_StoneClearing', 'onBuy')

    expect(player.fields[0]?.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    expect(player.cardStates.B113_PatchCaregiver?.extraData?.cardFieldStacks).toEqual([
      { crop: 'stone', remaining: 1 },
    ])
    expect(state.events.slice(eventCount)).toEqual([
      expect.objectContaining({
        type: 'farm.cropAdded',
        sourceCardId: 'C006_StoneClearing',
        crops: [expect.objectContaining({
          location: { kind: 'card', playerId: player.id, cardId: 'B113_PatchCaregiver' },
          crop: 'stone',
          amount: 1,
        })],
      }),
    ])
  })

  it('places stone only in slot 0 of an empty D75 Wood Field and reaps it normally', () => {
    const session = setupWithFields([{ row: 1, col: 0, stacks: [] }])
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('D075_WoodField')
    player.cardStates.D075_WoodField = {
      extraData: { cardFieldStacks: [null, null] },
    }
    const beforeStone = player.resources.stone

    runCardEffectHook(state, player, 'C006_StoneClearing', 'onBuy')

    expect(player.fields[0]?.stacks).toEqual([{ kind: 'stone', remaining: 1 }])
    expect(player.cardStates.D075_WoodField.extraData?.cardFieldStacks).toEqual([
      { crop: 'stone', remaining: 1 },
      null,
    ])

    const result = reap(state, player)
    expect(player.resources.stone - beforeStone).toBe(2)
    expect(result.reapSummary.resources.stone).toBe(2)
    expect(player.cardStates.D075_WoodField.extraData?.cardFieldStacks).toEqual([null, null])
  })

  it('leaves a partially occupied D75 Wood Field unchanged', () => {
    const session = setupWithFields([])
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('D075_WoodField')
    player.cardStates.D075_WoodField = {
      extraData: {
        cardFieldStacks: [{ crop: 'wood', remaining: 2 }, null],
      },
    }

    runCardEffectHook(state, player, 'C006_StoneClearing', 'onBuy')

    expect(player.cardStates.D075_WoodField.extraData?.cardFieldStacks).toEqual([
      { crop: 'wood', remaining: 2 },
      null,
    ])
  })

  it.each([
    'C070_LettucePatch',
    'E068_CherryOrchard',
    'E069_MelonPatch',
    'E070_CropRotationField',
  ])('does not run %s crop-specific callbacks for harvested stone', (cardId) => {
    const session = setupWithFields([])
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push(cardId)
    player.cardStates[cardId] = {}
    player.resources.grain = 1
    player.resources.vegetable = 1

    runCardEffectHook(state, player, 'C006_StoneClearing', 'onBuy')
    const result = reap(state, player)

    expect(result.reapSummary.resources.stone).toBe(1)
    expect(result.reactionFlow).toBeUndefined()
    expect(player.cardStates[cardId]?.extraData?.selectedPositions).toBeUndefined()
  })

  it('runs E72 Artichoke Field callback for harvested stone because it accepts any good', () => {
    const session = setupWithFields([])
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('E072_ArtichokeField')
    player.cardStates.E072_ArtichokeField = {}
    const beforeFood = player.resources.food

    runCardEffectHook(state, player, 'C006_StoneClearing', 'onBuy')
    const result = reap(state, player)

    expect(result.reapSummary.resources.stone).toBe(1)
    expect(player.resources.food - beforeFood).toBe(1)
  })
})

describe('C006_StoneClearing cross-card integration', () => {
  it('D63 Lynchet: stone fields adjacent to room tiles count for the food bonus', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.minorPlayed.push('C006_StoneClearing')
    player.minorPlayed.push('D063_Lynchet')

    player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
    player.fields = [
      { row: 1, col: 0, stacks: [] }, // orthogonally adjacent to (0,0)
      { row: 3, col: 3, stacks: [] }, // not adjacent to any room tile
    ]
    session.loadState(state)

    runCardEffectHook(state, player, 'C006_StoneClearing', 'onBuy')
    expect(player.fields.every((f) => f.stacks[0]?.kind === 'stone')).toBe(true)

    const result = reap(state, player)
    expect(result.type).toBe('ok')

    state.harvestReapSummary = {
      ...(state.harvestReapSummary ?? {}),
      [player.id]: result.reapSummary,
    }

    const flow = runCardEffectHook(state, player, 'D063_Lynchet', 'onAfterReap')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.params?.food).toBe(1) // only (1,0) is adjacent
  })

  it('A11-style empty-field counters: stone-clearing fields are NOT empty', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.minorPlayed.push('C006_StoneClearing')
    player.fields = [
      { row: 1, col: 0, stacks: [] },
      { row: 1, col: 1, stacks: [] },
    ]
    session.loadState(state)

    expect(player.fields.every(fieldIsEmpty)).toBe(true)

    runCardEffectHook(state, player, 'C006_StoneClearing', 'onBuy')

    expect(player.fields.every((f) => !fieldIsEmpty(f))).toBe(true)
    expect(player.fields.every((f) => f.stacks[0]?.kind === 'stone')).toBe(true)
  })
})
