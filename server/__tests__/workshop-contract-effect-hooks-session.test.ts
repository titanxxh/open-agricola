import { afterEach, describe, expect, it } from 'vitest'
import { clearCustomCards } from '../../shared/cards/custom-registry'
import type { GameState } from '../../shared/contract/types'
import { computeAnimalZones, computeInvalidAnimalsForZone } from '../../shared/domain/animal-zones'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { GameSession } from '../game/authoritative-session'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { COUNT_LEAF_SOURCE, compileContractCard, createRoundTenSession } from './_helpers/workshop-contract-card'

/**
 * ADR 0025 fixed behavior tests for the effect hooks that are not stage
 * hooks: the choice and extra-turn hooks, the turn-skip hook, and the queries
 * about scoring, housing, breeding order, locked tiles, special stables and
 * card animal zones. Each scenario is a two-player work phase in round 10;
 * player 0 has played a custom card that defines the hook under test, and the
 * opponent is the control.
 */

const CARD_ID = 'CUSTOM_HookProbe'

const sessions: GameSession[] = []
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose()
  clearCustomCards()
})

const start = (
  impl: string,
  options: { workers?: [number, number]; configure?: (state: GameState) => void } = {},
) => {
  const session = createRoundTenSession(compileContractCard(CARD_ID, `${COUNT_LEAF_SOURCE}\nconst CARD_IMPL = ${impl}`), options)
  sessions.push(session)
  return session
}

const effect = (hooks: string) => `{ effect: { id: CARD_ID, ${hooks} } }`

describe('Workshop Capability Contract effect hooks', () => {
  it('resolveChoice: runs after the player resolves a choice the card opened', () => {
    const session = start(`{
      effect: { id: CARD_ID, resolveChoice: () => count('resolved') },
      listeners: [{ cardIds: [CARD_ID], actions: ['collect'], phases: ['after'],
        handler: () => ({ sourceCard: CARD_ID, flow: { type: 'xor', sourceCard: CARD_ID,
          children: [gainLeaf(CARD_ID, { food: 2 }), gainLeaf(CARD_ID, { grain: 1 })] } }) }] }`)

    const offered = session.takeAction(0, 'forest')

    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: CARD_ID, request: { kind: 'choice' } })
    if (offered.interaction.stateId !== 'wait') return
    expect(offered.state.players[0]!.cardStates[CARD_ID]?.counters).toBeUndefined()

    const chosen = session.resolveChoice(0, offered.interaction.request.options![0]!.value)

    expect(chosen.ok).toBe(true)
    expect(chosen.state.players[0]!.resources).toMatchObject({ food: 12, grain: 0 })
    expect(chosen.state.players[0]!.cardStates[CARD_ID]?.counters).toEqual({ resolved: 1 })
    expect(session.cardWarnings).toEqual([])
  })

  it('contributeExtraTurn: runs its flow once after the owner\'s workers are placed', () => {
    const session = start(effect(`contributeExtraTurn: (state, player) => player.cardStates[CARD_ID] && player.cardStates[CARD_ID].flagged ? undefined
      : { type: 'seq', children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          gainLeaf(CARD_ID, { food: 1 })] }`), { workers: [1, 1] })

    expect(session.takeAction(0, 'forest').ok).toBe(true)
    confirmNextPlayer(session)
    expect(session.takeAction(1, 'clay-pit').ok).toBe(true)
    expect(session.getState().state.players[0]!.resources.food).toBe(10)

    // Both players have placed their only worker; the next turn is the card's extra turn.
    confirmNextPlayer(session)

    const extra = session.getState()
    expect(extra.state.players[0]!.resources.food).toBe(11)
    expect(extra.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
    expect(extra.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player' } })

    // The card no longer offers a turn, so it is not run again.
    confirmNextPlayer(session)
    expect(session.getState().state.players[0]!.resources.food).toBe(11)
    expect(session.cardWarnings).toEqual([])
  })

  it('onBeforePlayerTurn: skips the owner\'s turn while the hook says so', () => {
    const session = start(effect(`onBeforePlayerTurn: (state) =>
      ({ skipTurn: state.actionSpaces.find(space => space.id === 'forest').takenBy.length === 0 })`),
    { workers: [2, 2], configure: (state) => { state.currentPlayerIndex = 1 } })

    expect(session.takeAction(1, 'clay-pit').ok).toBe(true)
    confirmNextPlayer(session)
    // Forest is still free: the owner is skipped and the opponent places again.
    expect(session.getState().state.currentPlayerIndex).toBe(1)

    expect(session.takeAction(1, 'forest').ok).toBe(true)
    confirmNextPlayer(session)
    expect(session.getState().state.currentPlayerIndex).toBe(0)
    expect(session.cardWarnings).toEqual([])
  })

  it('computeCostedBonus: scores the declared level for its owner', () => {
    const session = start(effect('computeCostedBonus: () => [{ cost: { food: 2 }, score: 3 }]'))

    const [owner, opponent] = session.getState().scores!

    // Both farms are otherwise identical.
    expect(owner!.total - opponent!.total).toBe(3)
    expect(session.cardWarnings).toEqual([])
  })

  it('computeSharedPostScore: applies the returned adjustment to the named player', () => {
    const session = start(effect('computeSharedPostScore: (state, owner) => [{ playerId: owner.id, score: 2 }]'))

    const [owner, opponent] = session.getState().scores!

    expect(owner!.total - opponent!.total).toBe(2)
    expect(session.cardWarnings).toEqual([])
  })

  it('computeExtraRoomCapacity: houses a new family member without a free room', () => {
    // Two people live in two rooms: without extra capacity the space is closed.
    const full = start(effect('computeExtraRoomCapacity: () => 0'))
    expect(full.takeAction(0, 'wish-children')).toMatchObject({ ok: false, error: 'space unavailable' })
    clearCustomCards()

    const session = start(effect('computeExtraRoomCapacity: () => 1'))

    const grown = session.takeAction(0, 'wish-children')

    expect(grown.ok).toBe(true)
    expect(grown.state.players[0]!.rooms).toBe(2)
    expect(grown.state.players[0]!.workers.filter(worker => worker.isActive)).toHaveLength(3)
    expect(session.cardWarnings).toEqual([])
  })

  it('computeHarvestBreedOrderPriority: a larger value breeds later', () => {
    const breedingOrder = (priority: number) => {
      const session = start(`{
        effect: { id: CARD_ID, computeHarvestBreedOrderPriority: () => ${priority} },
        listeners: [{ cardIds: [CARD_ID], actions: ['breed'], phases: ['before'], scope: 'any',
          handler: (ctx) => ({ sourceCard: CARD_ID, flow: { type: 'leaf', actionId: 'push-to-card-stack', sourceCard: CARD_ID,
            params: { item: ctx.player.id } } }) }] }`,
      { configure: (state) => {
        // Round 4 ends with the first Harvest.
        state.round = 4
        state.players.forEach(player => markAllWorkersUsed(state, player))
      } })
      autoAdvanceRoundEnd(session, { maxIterations: 200 })
      const state = session.getState().state
      expect(state.round).toBe(5)
      expect(session.cardWarnings).toEqual([])
      const order = state.players[0]!.cardStates[CARD_ID]?.stack
      clearCustomCards()
      return { order, ids: state.players.map(player => player.id) }
    }

    const unchanged = breedingOrder(0)
    expect(unchanged.order).toEqual(unchanged.ids)
    const later = breedingOrder(5)
    expect(later.order).toEqual([...later.ids].reverse())
  })

  it('computeLockedFarmTiles: removes the locked tiles from the owner\'s plow choices', () => {
    const session = start(effect('computeLockedFarmTiles: () => [{ row: 0, col: 1 }, { row: 0, col: 2 }]'))
    const plowTiles = (playerIndex: number) => {
      const pending = session.takeAction(playerIndex, 'farmland')
      if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'farm-select') throw new Error('expected a plow selection')
      const tiles = pending.interaction.request.farm.selectableTiles
      session.commitSelectionChoice(playerIndex, { tile: tiles[0] })
      return tiles.map(tile => `${tile.row}-${tile.col}`)
    }

    const ownerTiles = plowTiles(0)
    // The same lock is published per player for the client's farm display.
    const display = session.buildSyncPayload(session.getState(), null).state.players

    expect(ownerTiles).not.toContain('0-1')
    expect(ownerTiles).not.toContain('0-2')
    expect(ownerTiles).toContain('0-3')
    expect(display[0]!.lockedFarmTileKeys).toEqual(['0-1', '0-2'])
    expect(display[1]!.lockedFarmTileKeys).toEqual([])
    expect(session.cardWarnings).toEqual([])
  })

  it('getBuiltSpecialStables: shows the returned tiles in the owner\'s display fields', () => {
    const session = start(effect('getBuiltSpecialStables: () => [{ row: 0, col: 2 }]'))

    const players = session.buildSyncPayload(session.getState(), null).state.players

    expect(players[0]!.specialStables).toEqual([{ position: { row: 0, col: 2 }, sourceCardId: CARD_ID }])
    expect(players[1]!.specialStables).toEqual([])
    expect(session.cardWarnings).toEqual([])
  })

  it('getInvalidAnimals: decides which animals may not stay in the card\'s own zone', () => {
    const session = start(effect(`
      onComputeAnimalZones: (player) => [{ id: 'probe-zone', zoneType: 'card', ownerPlayerId: player.id, capacity: 3 }],
      getInvalidAnimals: (player, zone, meeples) => meeples.filter(meeple => meeple.type !== 'sheep')`))
    const state = session.state
    const owner = state.players[0]!

    const zone = session.withCtx(() => computeAnimalZones(owner, state)).find(candidate => candidate.id === 'probe-zone')!
    const invalid = session.withCtx(() =>
      computeInvalidAnimalsForZone(state, owner, { ...zone, animalCounts: { sheep: 1, boar: 2 } }))

    expect(zone).toMatchObject({ zoneType: 'card', cardId: CARD_ID, capacity: 3 })
    expect(invalid).toEqual([{ type: 'boar' }, { type: 'boar' }])
    expect(session.cardWarnings).toEqual([])
  })
})
