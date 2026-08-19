import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { D075_WoodField } from '../../shared/cards/D/D075_WoodField'
import {
  getMinorImprovementCard,
  isFieldCard,
  implementedMinorImprovementCards,
} from '../../shared/cards/catalog'
import '../../shared/cards/D/D075_WoodField'

const CARD_ID = 'D075_WoodField'
const ROW = -1
const COL_BASE = 4075

const setup = (options?: {
  wood?: number
  stacks?: { crop: 'wood'; remaining: number }[]
}) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'

  const player = state.players[0]!
  player.workersAvailable = 2
  player.resources.food = 10
  player.resources.wood = options?.wood ?? 0
  player.minorPlayed.push(CARD_ID)

  // D75 sow path doesn't require empty normal fields (extra-field path).
  player.fields = []

  if (options?.stacks !== undefined) {
    player.cardStates = player.cardStates ?? {}
    player.cardStates[CARD_ID] = { extraData: { cardFieldStacks: options.stacks } }
  }

  session.loadState(state)
  return session
}

describe('D075_WoodField metadata', () => {
  it('is registered as a field card via isField metadata', () => {
    expect(D075_WoodField.isField).toBe(true)
    expect(isFieldCard(CARD_ID)).toBe(true)
  })

  it('is now part of the dealt pool (implemented flag is no longer set)', () => {
    const card = getMinorImprovementCard(CARD_ID)
    expect(card).toBeDefined()
    expect(card!.implemented).toBeUndefined()
    const dealtIds = implementedMinorImprovementCards.map((c) => c.id)
    expect(dealtIds).toContain(CARD_ID)
  })

  it('carries reference cost / vp / prerequisite metadata', () => {
    expect(D075_WoodField.cost).toEqual({ food: 1 })
    expect(D075_WoodField.vp).toBe(1)
    expect(D075_WoodField.prerequisite).toBe('1 Occupation')
    expect(D075_WoodField.occupationPrerequisites).toEqual({ min: 1 })
  })
})

describe('D075_WoodField session', () => {
  it('sows 1 wood through the real sow interaction and gains 1 wood on the next harvest', () => {
    const session = setup({ wood: 1 })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    if (!resp.ok || resp.interaction.stateId !== 'wait') {
      throw new Error('expected sow interaction')
    }
    if (resp.interaction.request.farm.farmType !== 'sow') throw new Error('expected sow farm')
    expect(resp.interaction.request.farm.selectableFields).toContainEqual({
      tile: { row: ROW, col: COL_BASE },
      allowedCrops: ['wood'],
      sourceCard: CARD_ID,
      groupKey: CARD_ID,
    })

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: ROW, col: COL_BASE, crop: 'wood' }],
    })
    expect(resp.ok).toBe(true)
    const playerAfter = resp.state.players[0]!
    expect(playerAfter.resources.wood).toBe(0)
    expect(readCardExtraData(playerAfter, CARD_ID, 'cardFieldStacks')).toEqual([
      { crop: 'wood', remaining: 3 },
    ])

    // Drive a single harvest tick directly: onHarvestFieldPhase is the unit
    // of work — running it on the post-sow state must hand back 1 wood.
    runCardEffectHook(resp.state, playerAfter, CARD_ID, 'onHarvestFieldPhase')
    expect(playerAfter.resources.wood).toBe(1)
    expect(readCardExtraData(playerAfter, CARD_ID, 'cardFieldStacks')).toEqual([
      { crop: 'wood', remaining: 2 },
    ])
  })

  it('sows 2 wood across 2 slots in a single sow action and gains 2 wood on the next harvest', () => {
    const session = setup({ wood: 2 })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    if (!resp.ok || resp.interaction.stateId !== 'wait') {
      throw new Error('expected sow interaction')
    }
    if (resp.interaction.request.farm.farmType !== 'sow') throw new Error('expected sow farm')
    const slot0 = resp.interaction.request.farm.selectableFields.find(
      (f) => f.tile.row === ROW && f.tile.col === COL_BASE,
    )
    const slot1 = resp.interaction.request.farm.selectableFields.find(
      (f) => f.tile.row === ROW && f.tile.col === COL_BASE + 1,
    )
    expect(slot0).toBeDefined()
    expect(slot1).toBeDefined()
    // Both slots share groupKey so they merge into a single logical field
    // for maxSelections counting (the reference "considered 1 field" semantics).
    expect(slot0!.groupKey).toBe(CARD_ID)
    expect(slot1!.groupKey).toBe(CARD_ID)

    resp = session.commitSelectionChoice(0, {
      crops: [
        { row: ROW, col: COL_BASE, crop: 'wood' },
        { row: ROW, col: COL_BASE + 1, crop: 'wood' },
      ],
    })
    expect(resp.ok).toBe(true)
    const playerAfter = resp.state.players[0]!
    expect(playerAfter.resources.wood).toBe(0)
    expect(readCardExtraData(playerAfter, CARD_ID, 'cardFieldStacks')).toEqual([
      { crop: 'wood', remaining: 3 },
      { crop: 'wood', remaining: 3 },
    ])

    runCardEffectHook(resp.state, playerAfter, CARD_ID, 'onHarvestFieldPhase')
    expect(playerAfter.resources.wood).toBe(2)
    expect(readCardExtraData(playerAfter, CARD_ID, 'cardFieldStacks')).toEqual([
      { crop: 'wood', remaining: 2 },
      { crop: 'wood', remaining: 2 },
    ])
  })

  it('clears all stacks after 3 harvest ticks against a fully sown 2-stack card', () => {
    const session = setup({
      wood: 0,
      stacks: [
        { crop: 'wood', remaining: 3 },
        { crop: 'wood', remaining: 3 },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    let total = 0
    for (let i = 0; i < 3; i++) {
      const before = player.resources.wood
      runCardEffectHook(state, player, CARD_ID, 'onHarvestFieldPhase')
      total += player.resources.wood - before
    }
    expect(total).toBe(6)
    expect(readCardExtraData(player, CARD_ID, 'cardFieldStacks')).toEqual([])
  })
})
