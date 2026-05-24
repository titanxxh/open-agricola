import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/domain/player'
import { getAllTilePositions } from '../../shared/domain/farm'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'
import '../../shared/cards/E/E148_Lazybones'

const CARD_ID = 'E148_Lazybones'
const TRIGGER_SPACES = ['grain-seeds', 'farmland', 'day-laborer', 'farm-expansion']
const CHOICE_PREFIX = 'lazybones:'

const selectedSpacesFromChoice = (value: string) =>
  value.startsWith(CHOICE_PREFIX) ? value.slice(CHOICE_PREFIX.length).split(',').filter(Boolean) : []

describe('E148_Lazybones session', () => {
  const setup = (reservedActionSpaces = TRIGGER_SPACES) => {
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push(CARD_ID)
    owner.cardStates = {
      ...owner.cardStates,
      [CARD_ID]: { extraData: { reservedActionSpaces } },
    }

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    session.loadState(state)
    return session
  }

  it('onBuy offers selectable action-space choices up to dynamic reserve', () => {
    const session = new GameSession()
    const state = session.getState().state
    const owner = state.players[0]!
    owner.stableTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]

    const flow = getCardEffect(CARD_ID)!.onBuy!(state, owner)

    expect(flow?.type).toBe('leaf')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('emit-choice')
    const options = leaf.params?.options as Array<{ value: string }>
    expect(options.length).toBeGreaterThan(0)
    expect(options.every((option) => selectedSpacesFromChoice(option.value).length <= 2)).toBe(true)
    expect(options.some((option) => selectedSpacesFromChoice(option.value).length === 2)).toBe(true)
    expect(options.some((option) => selectedSpacesFromChoice(option.value).length === 3)).toBe(false)
    expect(owner.cardStates?.[CARD_ID]?.extraData?.reservedActionSpaces).toBeUndefined()
  })

  it('onBuy returns nothing if dynamic reserve is empty', () => {
    const session = new GameSession()
    const state = session.getState().state

    const owner = state.players[0]!
    owner.stableTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 },
      { row: 0, col: 2 }, { row: 0, col: 3 },
    ]

    const flow = getCardEffect(CARD_ID)!.onBuy!(state, owner)

    expect(flow).toBeUndefined()
  })

  it('owner receives free stable when opponent uses grain-seeds', () => {
    const session = setup()

    const resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(1)

    const spaces = owner.cardStates?.[CARD_ID]?.extraData?.reservedActionSpaces as string[]
    expect(spaces).not.toContain('grain-seeds')
    expect(spaces.length).toBe(3)
  })

  it('owner receives free stable when opponent uses day-laborer', () => {
    const session = setup()

    const resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(1)

    const spaces = owner.cardStates?.[CARD_ID]?.extraData?.reservedActionSpaces as string[]
    expect(spaces).not.toContain('day-laborer')
    expect(spaces.length).toBe(3)
  })

  it('no trigger for unmarked spaces', () => {
    const session = setup()

    const resp = session.takeAction(1, 'lessons')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(0)
    const spaces = owner.cardStates?.[CARD_ID]?.extraData?.reservedActionSpaces as string[]
    expect(spaces.length).toBe(4)
  })

  it('no trigger after stable already collected from a space', () => {
    const session = setup()

    let resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.stableTiles.length).toBe(1)

    const state = session.getState().state
    state.round += 1
    for (const space of state.actionSpaces) {
      space.takenBy = []
    }
    state.currentPlayerIndex = 1
    state.players[1]!.workersAvailable = 2
    session.loadState(state)

    resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(1)
  })

  it('no trigger when owner uses their own marked space', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.players[0]!.workersAvailable = 2
    session.loadState(state)

    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(0)
    const spaces = owner.cardStates?.[CARD_ID]?.extraData?.reservedActionSpaces as string[]
    expect(spaces).toContain('grain-seeds')
  })

  it('removes the reserved space without a stable gain log when owner has no empty tile', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.fields = getAllTilePositions().map((tile) => ({
      row: tile.row,
      col: tile.col,
      stacks: [],
    }))
    session.loadState(state)

    const resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(0)
    const spaces = owner.cardStates?.[CARD_ID]?.extraData?.reservedActionSpaces as string[]
    expect(spaces).not.toContain('grain-seeds')
    expect(owner.cardStates?.[CARD_ID]?.resourceStats?.used ?? 0).toBe(0)
    expect(resp.state.log.some((entry) =>
      entry.key === 'log.cardEffectGain' &&
      entry.params?.cardId === CARD_ID,
    )).toBe(false)
  })
})
