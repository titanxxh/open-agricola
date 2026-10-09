import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import { getAllTilePositions } from '../../shared/domain/farm'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import type { ActionChoiceOption, ActionFlow } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import '../../shared/cards/E/E148_Lazybones'

const CARD_ID = 'E148_Lazybones'
const TRIGGER_SPACES = ['grain-seeds', 'farmland', 'day-laborer', 'farm-expansion']
const CHOICE_PREFIX = 'lazybones:'

// Design: reuse a generic bounded choice multi-select; reservation stays card-local.
// Session coverage is required for pending refresh, supply reservation, and rejection.
const playLazybones = (remaining = 4) => {
  const session = new GameSession(8148, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const owner = session.state.players[0]!
  owner.occupationHand = [CARD_ID]
  owner.resources.food = 5
  owner.supplyTokensConsumed = { stable: 4 - remaining }
  let response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationPlayed.includes(CARD_ID)) response = session.resolveChoice(0, CARD_ID)
  expect(response.ok, response.error).toBe(true)
  return { session, response }
}

describe('E148_Lazybones session', () => {
  it.each([1, 2, 3, 4])('offers four independent spaces with %i stable tokens remaining', (remaining) => {
    const { session, response: offered } = playLazybones(remaining)
    expect(offered.state.players).toHaveLength(2)
    expect(offered.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0, sourceCard: CARD_ID,
      request: {
        kind: 'choice',
        options: TRIGGER_SPACES.map((value) => ({ value, labelKey: `actions.${value}.name` })),
        multiSelect: { valuePrefix: CHOICE_PREFIX, minSelections: 0, maxSelections: remaining },
        requiresExplicitChoice: true,
      },
    })
    const selected = TRIGGER_SPACES.slice(0, remaining)
    const response = session.resolveChoice(0, `${CHOICE_PREFIX}${selected.join(',')}`)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.sourceCard).not.toBe(CARD_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toEqual(selected)
    expect(getAvailableStableSupplyCount(response.state, response.state.players[0]!)).toBe(0)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.players[0]!.resources).toEqual(offered.state.players[0]!.resources)
    expect(response.scores).toEqual(offered.scores)
    expect(response.state.log.some((entry) => entry.key === 'log.cardEffectGain' && entry.params?.cardId === CARD_ID)).toBe(false)
  })

  it('skips the reservation interaction when supply is empty', () => {
    const { response } = playLazybones(0)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.interaction.sourceCard).not.toBe(CARD_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toBeUndefined()
  })

  it('allows confirming no spaces without reserving supply', () => {
    const { session, response: offered } = playLazybones()
    const response = session.resolveChoice(0, CHOICE_PREFIX)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.sourceCard).not.toBe(CARD_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toBeUndefined()
    expect(getAvailableStableSupplyCount(response.state, response.state.players[0]!)).toBe(4)
    expect(response.state.players[0]!.resources).toEqual(offered.state.players[0]!.resources)
    expect(response.scores).toEqual(offered.scores)
  })

  it('preserves the bounded multi-select across session restoration', () => {
    const { session } = playLazybones(2)
    const saved = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(saved))))
    expect(restored.getState().interaction).toMatchObject({
      stateId: 'wait', sourceCard: CARD_ID,
      request: { kind: 'choice', multiSelect: { maxSelections: 2 } },
    })
    expect(restored.resolveChoice(0, 'lazybones:grain-seeds,farmland,day-laborer').ok).toBe(false)
    const accepted = restored.resolveChoice(0, 'lazybones:grain-seeds,farmland')
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toEqual(TRIGGER_SPACES.slice(0, 2))
  })

  it('undoes a reservation back to the four-candidate choice and allows a new subset', () => {
    const { session } = playLazybones(2)
    expect(session.resolveChoice(0, 'lazybones:grain-seeds,farmland').ok).toBe(true)
    const undone = session.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.interaction).toMatchObject({
      stateId: 'wait', sourceCard: CARD_ID,
      request: { kind: 'choice', multiSelect: { maxSelections: 2 } },
    })
    expect(getAvailableStableSupplyCount(undone.state, undone.state.players[0]!)).toBe(2)
    expect(undone.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toBeUndefined()
    const accepted = session.resolveChoice(0, 'lazybones:day-laborer')
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toEqual(['day-laborer'])
  })

  it.each([
    'lazybones:grain-seeds,farmland,day-laborer',
    'lazybones:grain-seeds,grain-seeds',
    'lazybones:forest',
    'lazybones:grain-seeds,',
    'grain-seeds',
  ])('rejects invalid multi-selection %s atomically and permits retry', (choice) => {
    const { session, response: offered } = playLazybones(2)
    const before = structuredClone({ players: offered.state.players, log: offered.state.log })
    const rejected = session.resolveChoice(0, choice)
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players).toEqual(before.players)
    expect(rejected.state.log).toEqual(before.log)
    expect(rejected.scores).toEqual(offered.scores)
    expect(rejected.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD_ID, request: offered.interaction.request })
    const accepted = session.resolveChoice(0, 'lazybones:grain-seeds,farmland')
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toEqual(TRIGGER_SPACES.slice(0, 2))
  })

  it.each([1, 4])('refreshes reservation choices after constructing %i stables', (built) => {
    const session = new GameSession(8148, undefined, { playerCount: 2 })
    for (const player of session.state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    const owner = session.state.players[0]!
    owner.occupationHand = [CARD_ID]
    owner.occupationPlayed = ['C094_StableCleaner']
    owner.resources.food = 5
    owner.resources.wood = 4
    let response = session.takeAction(0, 'lessons')
    if (!response.state.players[0]!.occupationPlayed.includes(CARD_ID)) response = session.resolveChoice(0, CARD_ID)
    expect(response.ok, response.error).toBe(true)
    const fourSpaces = `${CHOICE_PREFIX}${TRIGGER_SPACES.join(',')}`
    expect(response.interaction.request).toMatchObject({ multiSelect: { maxSelections: 4 } })
    expect(response.interaction.request.options.map((option) => option.value)).toEqual(TRIGGER_SPACES)
    response = session.takeAnytimeAction(0, 'C94-stable-cleaner-anytime')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request.kind).toBe('farm-select')
    const tiles = response.interaction.request.farm.selectableTiles.slice(0, built)
    response = session.commitSelectionChoice(0, { stables: tiles })
    expect(response.ok, response.error).toBe(true)
    if (built === 4) {
      expect(getAvailableStableSupplyCount(response.state, response.state.players[0]!)).toBe(0)
      expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toBeUndefined()
      expect(response.interaction.sourceCard).not.toBe(CARD_ID)
      return
    }
    expect(getAvailableStableSupplyCount(response.state, response.state.players[0]!)).toBe(3)
    expect(response.interaction.request).toMatchObject({ multiSelect: { maxSelections: 3 } })
    expect(response.interaction.request.options.map((option) => option.value)).toEqual(TRIGGER_SPACES)
    const before = structuredClone(response.state.players)
    response = session.resolveChoice(0, fourSpaces)
    expect(response.ok).toBe(false)
    expect(response.state.players).toEqual(before)
    expect(response.interaction.stateId).toBe('wait')
    response = session.resolveChoice(0, `${CHOICE_PREFIX}${TRIGGER_SPACES.slice(0, 3).join(',')}`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces).toEqual(TRIGGER_SPACES.slice(0, 3))
    expect(response.state.players[0]!.stableTiles).toEqual(tiles)
  })

  const setup = (reservedActionSpaces = TRIGGER_SPACES) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
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

  const placeLazybonesStable = (session: GameSession, actionId: string, chooseLast = false) => {
    let offered = session.takeAction(1, actionId)
    expect(offered.ok, offered.error).toBe(true)
    while (offered.interaction.stateId === 'wait' && offered.interaction.request.kind === 'confirm-player-switch') {
      offered = confirmPlayerSwitch(session)
    }
    expect(offered.interaction.stateId).toBe('wait')
    expect(offered.interaction.stateId === 'wait' ? offered.interaction.request.kind : undefined)
      .toBe('farm-select')
    if (offered.interaction.stateId !== 'wait' || offered.interaction.request.kind !== 'farm-select') {
      throw new Error('expected Lazybones stable selection')
    }
    expect(offered.interaction.playerIndex).toBe(0)
    expect(offered.interaction.request.farm.farmType).toBe('stable')
    const tiles = offered.interaction.request.farm.selectableTiles
    expect(tiles.length).toBeGreaterThan(1)
    const tile = chooseLast ? tiles.at(-1)! : tiles[0]!
    return { offered, tile, response: session.commitSelectionChoice(0, { stables: [tile] }) }
  }

  it('onBuy offers selectable action-space choices up to dynamic reserve', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const owner = state.players[0]!
    owner.stableTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
    const reserveBefore = getAvailableStableSupplyCount(state, owner)

    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onBuy!(state, owner)

    expect(flow?.type).toBe('leaf')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('emit-choice')
    const options = leaf.params?.options as ActionChoiceOption[]
    expect(options.length).toBeGreaterThan(0)
    expect(options.map((option) => option.value)).toEqual(TRIGGER_SPACES)
    expect(leaf.params?.multiSelect).toEqual({ valuePrefix: CHOICE_PREFIX, minSelections: 0, maxSelections: 2 })

    effect.resolveChoice!(state, owner, CHOICE_PREFIX)

    expect(owner.cardStates?.[CARD_ID]?.extraData?.reservedActionSpaces).toBeUndefined()
    expect(getAvailableStableSupplyCount(state, owner)).toBe(reserveBefore)
  })

  it('onBuy returns nothing if dynamic reserve is empty', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state

    const owner = state.players[0]!
    owner.stableTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 },
      { row: 0, col: 2 }, { row: 0, col: 3 },
    ]

    const flow = getCardEffect(CARD_ID)!.onBuy!(state, owner)

    expect(flow).toBeUndefined()
  })

  it('owner chooses any legal free stable position when opponent uses grain-seeds', () => {
    const session = setup()
    const woodBefore = session.state.players[0]!.resources.wood
    const { tile, response: resp } = placeLazybonesStable(session, 'grain-seeds', true)
    expect(resp.ok, resp.error).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles).toEqual([tile])
    expect(owner.resources.wood).toBe(woodBefore)

    const spaces = owner.cardStates?.[CARD_ID]?.extraData?.reservedActionSpaces as string[]
    expect(spaces).not.toContain('grain-seeds')
    expect(spaces.length).toBe(3)
  })

  it('owner receives free stable when opponent uses day-laborer', () => {
    const session = setup()

    const { response: resp } = placeLazybonesStable(session, 'day-laborer')
    expect(resp.ok, resp.error).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(1)

    const spaces = owner.cardStates?.[CARD_ID]?.extraData?.reservedActionSpaces as string[]
    expect(spaces).not.toContain('day-laborer')
    expect(spaces.length).toBe(3)
  })

  it('no trigger for unmarked spaces', () => {
    const session = setup()

    const resp = session.takeAction(1, 'forest')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(0)
    const spaces = owner.cardStates?.[CARD_ID]?.extraData?.reservedActionSpaces as string[]
    expect(spaces.length).toBe(4)
  })

  it('no trigger after stable already collected from a space', () => {
    const session = setup()

    let resp = placeLazybonesStable(session, 'grain-seeds').response
    expect(resp.ok, resp.error).toBe(true)
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

  it('returns the stable to supply when every otherwise empty tile is placement-locked', () => {
    const session = setup()
    const state = session.getState().state
    const [locked, ...occupied] = getAllTilePositions()
    state.players[0]!.fields = occupied.map((tile) => ({
      row: tile.row,
      col: tile.col,
      stacks: [],
    }))
    state.players[0]!.farmyardSpaceStates = [{
      spaceKey: `${locked!.row}-${locked!.col}`,
      sourceCardId: '__test_lock__',
      kind: 'blocked-farmyard-space',
      blocksPlacement: true,
    }]
    session.loadState(state)

    const response = session.takeAction(1, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.reservedActionSpaces)
      .not.toContain('grain-seeds')
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : response.interaction.stateId)
      .not.toBe('farm-select')
  })

  it('rejects an illegal position atomically and allows the owner to retry', () => {
    const session = setup()
    let offered = session.takeAction(1, 'grain-seeds')
    while (offered.interaction.stateId === 'wait' && offered.interaction.request.kind === 'confirm-player-switch') {
      offered = confirmPlayerSwitch(session)
    }
    expect(offered.interaction.stateId).toBe('wait')
    expect(offered.interaction.stateId === 'wait' ? offered.interaction.request.kind : undefined)
      .toBe('farm-select')
    if (offered.interaction.stateId !== 'wait' || offered.interaction.request.kind !== 'farm-select') {
      throw new Error('expected Lazybones stable selection')
    }
    const beforeOwner = structuredClone(offered.state.players[0])
    const beforeOpponent = structuredClone(offered.state.players[1])
    const beforeRequest = structuredClone(offered.interaction.request)
    const rejected = session.commitSelectionChoice(0, { stables: [{ row: 99, col: 99 }] })
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]).toEqual(beforeOwner)
    expect(rejected.state.players[1]).toEqual(beforeOpponent)
    expect(rejected.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      request: beforeRequest,
    })

    const tile = offered.interaction.request.farm.selectableTiles.at(-1)!
    const accepted = session.commitSelectionChoice(0, { stables: [tile] })
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.stableTiles).toContainEqual(tile)
  })
})
