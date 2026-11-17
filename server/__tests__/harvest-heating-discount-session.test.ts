import { afterEach, describe, expect, it } from 'vitest'
import { emptyResources } from '../../shared/contract/state-constants'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { captureStateWithHistory } from '../../shared/session/history-streams'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD_ID = 'M086_SpinningMill'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const prepare = ({ sheep, cached }: { sheep: number; cached?: number }) => {
  const session = createWorkSession({ seed: 5416, options: {
    enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
  }, configure(state) {
    state.round = 4
    for (const player of state.players) {
      player.resources = { ...emptyResources, food: 4, fuel: 2 }
      player.farmTerrain = []
      player.fields = []
      player.pastures = []
      player.stableTiles = []
      player.improvements = []
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      markAllWorkersUsed(state, player)
    }
    const player = state.players[0]!
    player.minorPlayed = [CARD_ID]
    player.improvements = ['Major_Fireplace1']
    player.resources.sheep = sheep
    if (sheep > 0) player.pastures = [{
      id: 'sheep', tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }], animalType: 'sheep', animalCount: sheep,
    }]
    if (cached !== undefined) writeCardExtraData(player, CARD_ID, 'heatingRoomDiscount', cached)
  } })
  sessions.push(session)
  return session
}

const requirements = (session: GameSession) => session.buildSyncPayload(session.getState(), []).state.players[0]!.harvestRequirements

const reachFeed = (session: GameSession) => {
  for (let step = 0; step < 20; step++) {
    const response = session.getState()
    if (response.interaction.stateId !== 'wait') throw new Error('Expected a harvest interaction')
    const { playerIndex, request } = response.interaction
    if (request.kind === 'feed') return request
    const value = request.kind === 'choice' ? '__skip__' : 'confirm'
    expect(['choice', 'confirm-next-player', 'confirm-player-switch']).toContain(request.kind)
    const next = session.resolveChoice(playerIndex, value)
    expect(next.ok, next.error).toBe(true)
  }
  throw new Error('Did not reach feeding')
}

describe('Spinning Mill harvest demand', () => {
  it.each([
    { sheep: 0, cached: undefined, fuel: 2 },
    { sheep: 4, cached: undefined, fuel: 0 },
    { sheep: 0, cached: 2, fuel: 2 },
  ])('previews $fuel fuel for $sheep sheep with cached discount $cached without settling the card', ({ sheep, cached, fuel }) => {
    const session = prepare({ sheep, cached })
    const before = captureStateWithHistory(session.state)
    const scores = session.getState().scores
    for (let read = 0; read < 2; read++) expect(requirements(session)).toEqual({ round: 4, food: 4, fuel })
    expect(captureStateWithHistory(session.state)).toEqual(before)
    expect(session.getState().scores).toEqual(scores)
  })

  it('preserves the field-phase discount after cooking sheep, through recovery and undo', () => {
    let session = prepare({ sheep: 4 })
    expect(session.performRoundEnd().ok).toBe(true)
    const feed = reachFeed(session)
    expect(session.state.roundPhase).toBe('feeding')
    expect(session.state.players[0]!.cardStates[CARD_ID]?.extraData?.heatingRoomDiscount).toBe(2)
    expect(session.state.players[0]!.cardStates[CARD_ID]?.extraData?.heatingRoomDiscountRound).toBe(4)
    expect(requirements(session)).toEqual({ round: 4, food: 4, fuel: 0 })
    const recipe = feed.exchangeCatalog?.find(entry => entry.from.sheep === 1 && entry.sourceId === 'Major_Fireplace1')
    if (!recipe) throw new Error('Expected the Fireplace sheep recipe')
    const cooked = session.resolveChoice(0, 'confirm', { selections: [{
      sourceId: recipe.sourceId, exchangeIndex: recipe.exchangeIndex, count: 4,
    }] })
    expect(cooked.ok, cooked.error).toBe(true)
    expect(cooked.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 8, fuel: 2 })
    expect(cooked.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'heating', required: 2 } })
    expect(requirements(session)).toEqual({ round: 4, food: 4, fuel: 0 })
    const saved = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(saved))
    sessions.push(restored)
    expect(restored.getState().interaction).toEqual(cooked.interaction)
    expect(restored.state.log).toEqual(cooked.state.log)
    expect(restored.getState().scores).toEqual(cooked.scores)
    expect(requirements(restored)).toEqual({ round: 4, food: 4, fuel: 0 })
    session = restored
    const undone = session.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ sheep: 4, food: 0, fuel: 2 })
    expect(undone.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'feed' } })
    expect(requirements(session)).toEqual({ round: 4, food: 4, fuel: 0 })
  })

  it('preserves legacy feeding snapshots without a capture-round marker', () => {
    const session = prepare({ sheep: 0, cached: 2 })
    session.state.roundPhase = 'feeding'
    expect(requirements(session)).toEqual({ round: 4, food: 4, fuel: 0 })
  })

  it('ignores the card discount while the card is not played', () => {
    const session = prepare({ sheep: 4, cached: 2 })
    session.state.players[0]!.minorPlayed = []
    expect(requirements(session)).toEqual({ round: 4, food: 4, fuel: 2 })
  })

  it('includes sheep hosted by another player in the same read-only calculation', () => {
    const session = prepare({ sheep: 0 })
    const player = session.state.players[0]!
    const owner = session.state.players[1]!
    const zoneId = `card:M033_NightPasture:owner:${owner.id}:animalOwner:${player.id}`
    writeCardExtraData(owner, 'M033_NightPasture', 'animalCountsByZone', {
      [zoneId]: {
        animalCounts: { sheep: 4 }, ownerPlayerId: owner.id, animalOwnerPlayerId: player.id,
        cardId: 'M033_NightPasture', capacity: 1, allowedAnimalType: null,
      },
    })
    expect(requirements(session)).toEqual({ round: 4, food: 4, fuel: 0 })
  })
})
