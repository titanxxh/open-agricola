import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { E080_RockGarden } from '../../shared/cards/E/E080_RockGarden'
import {
  getMinorImprovementCard,
  isFieldCard,
  implementedMinorImprovementCards,
} from '../../shared/cards/catalog'
import '../../shared/cards/E/E080_RockGarden'

const CARD_ID = 'E080_RockGarden'
const ROW = -1
const COL_BASE = 5080

const setup = (options?: {
  stone?: number
  stacks?: { crop: 'stone'; remaining: number }[]
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
  player.resources.stone = options?.stone ?? 0
  player.minorPlayed.push(CARD_ID)

  player.fields = []

  if (options?.stacks !== undefined) {
    player.cardStates = player.cardStates ?? {}
    player.cardStates[CARD_ID] = { extraData: { cardFieldStacks: options.stacks } }
  }

  session.loadState(state)
  return session
}

describe('E080_RockGarden metadata', () => {
  it('is registered as a field card via isField metadata', () => {
    expect(E080_RockGarden.isField).toBe(true)
    expect(isFieldCard(CARD_ID)).toBe(true)
  })

  it('is now part of the dealt pool (implemented flag is no longer set)', () => {
    const card = getMinorImprovementCard(CARD_ID)
    expect(card).toBeDefined()
    expect(card!.implemented).toBeUndefined()
    const dealtIds = implementedMinorImprovementCards.map((c) => c.id)
    expect(dealtIds).toContain(CARD_ID)
  })

  it('carries reference cost-free metadata (no printed cost)', () => {
    expect(E080_RockGarden.cost).toBeUndefined()
    expect(E080_RockGarden.vp).toBeUndefined()
  })
})

describe('E080_RockGarden session', () => {
  it('sows 1 stone through the real sow interaction and gains 1 stone on the next harvest', () => {
    const session = setup({ stone: 1 })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    if (!resp.ok || resp.interaction.stateId !== 'wait') {
      throw new Error('expected sow interaction')
    }
    if (resp.interaction.request.farm.farmType !== 'sow') throw new Error('expected sow farm')
    expect(resp.interaction.request.farm.selectableFields).toContainEqual({
      tile: { row: ROW, col: COL_BASE },
      allowedCrops: ['stone'],
      sourceCard: CARD_ID,
      groupKey: CARD_ID,
    })

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: ROW, col: COL_BASE, crop: 'stone' }],
    })
    expect(resp.ok).toBe(true)
    const playerAfter = resp.state.players[0]!
    expect(playerAfter.resources.stone).toBe(0)
    expect(readCardExtraData(playerAfter, CARD_ID, 'cardFieldStacks')).toEqual([
      { crop: 'stone', remaining: 2 },
      null,
      null,
    ])

    runCardEffectHook(resp.state, playerAfter, CARD_ID, 'onHarvestFieldPhase')
    expect(playerAfter.resources.stone).toBe(1)
    expect(readCardExtraData(playerAfter, CARD_ID, 'cardFieldStacks')).toEqual([
      { crop: 'stone', remaining: 1 },
      null,
      null,
    ])
  })

  it('sows 3 stones across 3 slots in a single sow action and gains 3 stones on the next harvest', () => {
    const session = setup({ stone: 3 })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    if (!resp.ok || resp.interaction.stateId !== 'wait') {
      throw new Error('expected sow interaction')
    }
    if (resp.interaction.request.farm.farmType !== 'sow') throw new Error('expected sow farm')
    const slots = [0, 1, 2].map((slotIdx) =>
      resp.interaction.request.farm.farmType === 'sow'
        ? resp.interaction.request.farm.selectableFields.find(
            (f) => f.tile.row === ROW && f.tile.col === COL_BASE + slotIdx,
          )
        : undefined,
    )
    expect(slots[0]).toBeDefined()
    expect(slots[1]).toBeDefined()
    expect(slots[2]).toBeDefined()
    // All 3 slots share groupKey so they merge into 1 logical field
    // (the reference "considered 1 field" semantics).
    for (const slot of slots) expect(slot!.groupKey).toBe(CARD_ID)

    resp = session.commitSelectionChoice(0, {
      crops: [
        { row: ROW, col: COL_BASE, crop: 'stone' },
        { row: ROW, col: COL_BASE + 1, crop: 'stone' },
        { row: ROW, col: COL_BASE + 2, crop: 'stone' },
      ],
    })
    expect(resp.ok).toBe(true)
    const playerAfter = resp.state.players[0]!
    expect(playerAfter.resources.stone).toBe(0)
    expect(readCardExtraData(playerAfter, CARD_ID, 'cardFieldStacks')).toEqual([
      { crop: 'stone', remaining: 2 },
      { crop: 'stone', remaining: 2 },
      { crop: 'stone', remaining: 2 },
    ])

    runCardEffectHook(resp.state, playerAfter, CARD_ID, 'onHarvestFieldPhase')
    expect(playerAfter.resources.stone).toBe(3)
    expect(readCardExtraData(playerAfter, CARD_ID, 'cardFieldStacks')).toEqual([
      { crop: 'stone', remaining: 1 },
      { crop: 'stone', remaining: 1 },
      { crop: 'stone', remaining: 1 },
    ])
  })

  it('clears all stacks after 2 harvest ticks against a fully sown 3-stack card', () => {
    const session = setup({
      stone: 0,
      stacks: [
        { crop: 'stone', remaining: 2 },
        { crop: 'stone', remaining: 2 },
        { crop: 'stone', remaining: 2 },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    let total = 0
    for (let i = 0; i < 2; i++) {
      const before = player.resources.stone
      runCardEffectHook(state, player, CARD_ID, 'onHarvestFieldPhase')
      total += player.resources.stone - before
    }
    expect(total).toBe(6)
    expect(readCardExtraData(player, CARD_ID, 'cardFieldStacks')).toEqual([null, null, null])
  })
})
