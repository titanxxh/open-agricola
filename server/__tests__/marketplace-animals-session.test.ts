import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnimalKey } from '../../shared/contract/animals'
import type { GameState, PlayerState } from '../../shared/contract/types'
import type { TeamConfiguration } from '../../shared/contract/team'
import { getAssignedAnimalsByType } from '../../shared/domain/animals'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { bonusScore } from './_helpers/card-play-lifecycle'
import { assertRejectedUnchanged } from './_helpers/session-assertions'

const sessions: GameSession[] = []
afterEach(() => { sessions.splice(0).forEach(session => session.dispose()) })
const team = { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private', cooperationRules: true } satisfies TeamConfiguration
const pasture = (id: string, animalCount = 0): PlayerState['pastures'][number] => ({
  id, size: 2, tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }], stables: 0,
  animalType: animalCount ? 'sheep' : null, animalCount,
})
function table(configure: (state: GameState) => void = () => {}, configuration: TeamConfiguration = team, moor = false) {
  const session = createWorkSession({ seed: 1626, options: { playerCount: 4, teamConfig: configuration, enableFarmersOfTheMoor: moor }, configure(state) {
    state.currentPlayerIndex = 0
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.houseAnimals = {}
      player.stableAnimals = {}
      player.pastures = []
      if (moor) player.farmTerrain = []
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 })
    }
    state.players[0]!.resources.sheep = 4
    state.players[0]!.pastures = [pasture('giver-pasture', 4)]
    configure(state)
  } })
  sessions.push(session)
  return session
}

const transfer = (session: GameSession, amount = 2, resource: AnimalKey = 'sheep') => {
  const started = session.takeAction(0, 'marketplace')
  expect(started.ok, started.error).toBe(true)
  return session.commitSelectionChoice(0, { marketplaceTransfers: [{ resource, direction: 'give', teammatePlayerId: 'p3', amount }] })
}
const animalRequest = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 2, request: { kind: 'animal-reorg' } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') throw new Error('Expected receiver animal arrangement')
  return response.interaction.request
}

describe('Marketplace animals', () => {
  it('removes the giver transfer and tax from real holders and lets the receiver place the animals', () => {
    const session = table(state => { state.players[2]!.pastures = [pasture('receiver-pasture')] })
    const received = transfer(session)
    const request = animalRequest(received)
    expect(received.state.players[0]!.resources.sheep).toBe(1)
    expect(received.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'sheep', animalCount: 1 })
    expect(received.state.players[2]!.resources.sheep).toBe(2)
    expect(request.zones.find(zone => zone.id === 'receiver-pasture')).toMatchObject({ animalType: 'sheep', animalCount: 2 })
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'confirm', { zones: request.zones }))
    const settled = session.resolveChoice(2, 'confirm', { zones: request.zones })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[2]!.pastures[0]).toMatchObject({ animalType: 'sheep', animalCount: 2 })
    expect(getAssignedAnimalsByType(session.state.players[0]!, session.state).sheep).toBe(1)
    expect(getAssignedAnimalsByType(session.state.players[2]!, session.state).sheep).toBe(2)
    expect(settled.state.players[2]!.stats.resourcesFromCards.sheep ?? 0).toBe(0)
    expect(settled.state.log.filter(entry => entry.key === 'log.marketplaceTransfer')).toHaveLength(1)
  })
  it('counts received sheep for the recipient Breed Registry without counting the giver tax or card income', () => {
    const card = 'D036_BreedRegistry'
    const session = table(state => {
      state.players[0]!.minorPlayed = [card]
      state.players[2]!.minorPlayed = [card]
      state.players[2]!.pastures = [pasture('receiver-pasture')]
    })
    expect(bonusScore(session.getState(), card, 0)).toBe(3)
    expect(bonusScore(session.getState(), card, 2)).toBe(3)
    const received = transfer(session, 3)
    const request = animalRequest(received)
    let settled = session.resolveChoice(2, 'confirm', { zones: request.zones })
    for (let guard = 0; guard < 8 && settled.interaction.stateId === 'wait' && settled.interaction.request.kind === 'confirm-player-switch'; guard++) {
      settled = session.resolveChoice(settled.interaction.playerIndex, 'confirm')
      expect(settled.ok, settled.error).toBe(true)
    }
    expect(settled.state.players[2]!.cardStates[card]?.extraData?.boardSheep).toBe(3)
    expect(settled.state.players[0]!.cardStates[card]?.extraData?.boardSheep ?? 0).toBe(0)
    expect(settled.state.players[0]!.resources.sheep).toBe(0)
    expect(settled.state.players[0]!.pastures[0]).toMatchObject({ animalCount: 0, animalType: null })
    expect(settled.state.players[2]!.pastures[0]).toMatchObject({ animalCount: 3, animalType: 'sheep' })
    expect(settled.state.players[2]!.stats.resourcesFromCards.sheep ?? 0).toBe(0)
    expect(bonusScore(settled, card, 0)).toBe(3)
    expect(bonusScore(settled, card, 2)).toBe(0)
    expect(settled.state.log.filter(entry => entry.key === 'log.marketplaceTransfer')).toHaveLength(1)
  })

  it('keeps overflow decisions with the receiver across recovery and rejects giver or duplicate submissions', () => {
    const session = table(state => { state.players[2]!.minorPlayed = ['D036_BreedRegistry'] })
    const received = transfer(session)
    const request = animalRequest(received)
    expect(request.zones.reduce((total, zone) => total + zone.animalCount, 0)).toBe(1)
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'confirm', { zones: request.zones }))
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { marketplaceTransfers: [
      { resource: 'sheep', direction: 'give', teammatePlayerId: 'p3', amount: 2 },
    ] }))
    const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    sessions.push(restored)
    const recovered = animalRequest(restored.getState())
    expect(recovered.zones).toEqual(request.zones)
    const settled = restored.resolveChoice(2, 'confirm', { zones: recovered.zones })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ sheep: 1, food: 0 })
    expect(settled.state.players[2]!.resources).toMatchObject({ sheep: 1, food: 0 })
    expect(Object.values(settled.state.players[2]!.houseAnimals)).toEqual(['sheep'])
    expect(settled.state.events).toContainEqual(expect.objectContaining({ type: 'farm.animalDiscarded', actorPlayerId: 'p3', animals: { sheep: 1 } }))
    expect(settled.state.log.filter(entry => entry.key === 'log.marketplaceTransfer')).toHaveLength(1)
    expect(settled.state.players[2]!.cardStates.D036_BreedRegistry?.extraData?.boardSheep).toBe(2)
    expect(bonusScore(settled, 'D036_BreedRegistry', 2)).toBe(3)
    assertRejectedUnchanged(restored, () => restored.commitSelectionChoice(0, { marketplaceTransfers: [
      { resource: 'sheep', direction: 'give', teammatePlayerId: 'p3', amount: 2 },
    ] }))
  })

  it('lets the receiver cook overflow with their own Fireplace and then confirm standard placement', () => {
    const session = table(state => { state.players[2]!.improvements = ['Major_Fireplace1'] })
    animalRequest(transfer(session))
    assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, 'exchange'))
    const opened = session.takeAnytimeAction(2, 'exchange')
    expect(opened.ok, opened.error).toBe(true)
    if (opened.interaction.stateId !== 'wait' || opened.interaction.request.kind !== 'choice') throw new Error('Expected receiver cookery choices')
    const recipe = opened.interaction.request.options.find(option => option.sourceCard === 'Major_Fireplace1' && (option.effectPreview?.resourcesPaid?.sheep ?? 0) > 0)
    if (!recipe) throw new Error('Expected Fireplace sheep recipe: ' + JSON.stringify(opened.interaction.request.options))
    const index = Number(recipe.value.split(':')[1])
    const cooked = session.resolveChoice(2, `bulk:${index}=1`)
    expect(cooked.ok, cooked.error).toBe(true)
    const request = animalRequest(cooked)
    expect(cooked.state.players[2]!.resources).toMatchObject({ sheep: 1, food: 2 })
    expect(cooked.state.players[0]!.resources).toMatchObject({ sheep: 1, food: 0 })
    const settled = session.resolveChoice(2, 'confirm', { zones: request.zones })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[2]!.resources).toMatchObject({ sheep: 1, food: 2 })
    expect(settled.state.events.filter(event => event.type === 'resource.exchanged')).toEqual([
      expect.objectContaining({ actorPlayerId: 'p3', paid: { sheep: 1 }, gained: { food: 2 } }),
    ])
    expect(settled.state.events.some(event => event.type === 'farm.animalDiscarded')).toBe(false)
  })

  it('preserves the receiving seat and an undo boundary in a Multihand transfer', () => {
    const session = table(() => {}, { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', cooperationRules: true })
    const received = transfer(session)
    const request = animalRequest(received)
    expect(received.interaction.allowedCommands).not.toContain('undoAction')
    assertRejectedUnchanged(session, () => session.undoAction())
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'confirm', { zones: request.zones }))
    const settled = session.resolveChoice(2, 'confirm', { zones: request.zones })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[2]!.resources.sheep).toBe(1)
    expect(settled.state.players[0]!.resources.sheep).toBe(1)
  })

  it('rejects an animal transfer without enough same-animal tax before changing any holder', () => {
    const session = table()
    expect(session.takeAction(0, 'marketplace').ok).toBe(true)
    for (let attempt = 0; attempt < 2; attempt++) {
      assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { marketplaceTransfers: [
        { resource: 'sheep', direction: 'give', teammatePlayerId: 'p3', amount: 4 },
      ] }))
    }
    const received = session.commitSelectionChoice(0, { marketplaceTransfers: [
      { resource: 'sheep', direction: 'give', teammatePlayerId: 'p3', amount: 2 },
    ] })
    animalRequest(received)
    expect(received.state.players[0]!.resources.sheep).toBe(1)
    expect(received.state.players[0]!.pastures[0]!.animalCount).toBe(1)
  })

  it('uses the standard animal payment across pasture, house and loose stable holders', () => {
    const session = table(state => {
      const giver = state.players[0]!
      giver.pastures[0]!.animalCount = 2
      const room = giver.roomTiles[0]!
      giver.houseAnimals = { [`${room.row}-${room.col}`]: 'sheep' }
      giver.stableTiles = [{ row: 2, col: 2 }]
      giver.stableAnimals = { '2-2': { animalType: 'sheep', animalCount: 1 } }
      state.players[2]!.pastures = [pasture('receiver-pasture')]
    })
    const received = transfer(session)
    animalRequest(received)
    const giver = received.state.players[0]!
    expect(giver.resources.sheep).toBe(1)
    expect(giver.pastures[0]).toMatchObject({ animalCount: 0, animalType: null })
    expect(giver.houseAnimals).toEqual({})
    expect(giver.stableAnimals).toEqual({ '2-2': { animalType: 'sheep', animalCount: 1 } })
    expect(getAssignedAnimalsByType(session.state.players[0]!, session.state).sheep).toBe(1)
  })

  it('makes horses transferable only when Farmers of the Moor enables them', () => {
    const ordinary = table()
    const start = ordinary.takeAction(0, 'marketplace')
    expect(start.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'marketplace-select' } })
    if (start.interaction.stateId !== 'wait' || start.interaction.request.kind !== 'marketplace-select') throw new Error('Expected Marketplace')
    expect(start.interaction.request.goods).not.toContain('horse')
    assertRejectedUnchanged(ordinary, () => ordinary.commitSelectionChoice(0, { marketplaceTransfers: [
      { resource: 'horse', direction: 'give', teammatePlayerId: 'p3', amount: 1 },
    ] }))
    const moor = table(state => {
      state.players[0]!.resources.sheep = 0
      state.players[0]!.resources.horse = 4
      state.players[0]!.pastures[0] = { ...pasture('horse-giver', 4), animalType: 'horse' }
      state.players[2]!.pastures = [pasture('horse-receiver')]
    }, team, true)
    const received = transfer(moor, 2, 'horse')
    const request = animalRequest(received)
    expect(received.state.players[0]!.resources.horse).toBe(1)
    expect(received.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'horse', animalCount: 1 })
    expect(received.state.players[2]!.resources.horse).toBe(2)
    const settled = moor.resolveChoice(2, 'confirm', { zones: request.zones })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[2]!.pastures[0]).toMatchObject({ animalType: 'horse', animalCount: 2 })
  })

  it.each(['played', 'hand'])('tracks at most two received sheep for Breed Registry in the %s zone', zone => {
    const card = 'D036_BreedRegistry'
    const session = table(state => {
      if (zone === 'played') state.players[2]!.minorPlayed = [card]
      else state.players[2]!.minorHand = [card]
      state.players[2]!.pastures = [pasture('receiver-pasture')]
    })
    const received = transfer(session)
    const request = animalRequest(received)
    let settled = session.resolveChoice(2, 'confirm', { zones: request.zones })
    for (let guard = 0; guard < 8 && settled.interaction.stateId === 'wait' && settled.interaction.request.kind === 'confirm-player-switch'; guard++) {
      settled = session.resolveChoice(settled.interaction.playerIndex, 'confirm')
      expect(settled.ok, settled.error).toBe(true)
    }
    expect(settled.state.players[2]!.cardStates[card]?.extraData?.boardSheep).toBe(2)
    expect(bonusScore(settled, card, 2)).toBe(zone === 'played' ? 3 : 0)
  })

  it('does not count a received boar as sheep for Breed Registry', () => {
    const card = 'D036_BreedRegistry'
    const session = table(state => {
      state.players[0]!.resources.sheep = 0
      state.players[0]!.resources.boar = 3
      state.players[0]!.pastures[0] = { ...pasture('boar-giver', 3), animalType: 'boar' }
      state.players[2]!.minorPlayed = [card]
      state.players[2]!.pastures = [pasture('boar-receiver')]
    })
    const received = transfer(session, 1, 'boar')
    const request = animalRequest(received)
    const settled = session.resolveChoice(2, 'confirm', { zones: request.zones })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[2]!.cardStates[card]?.extraData?.boardSheep ?? 0).toBe(0)
    expect(bonusScore(settled, card, 2)).toBe(3)
  })

  it('charges a teammate giver and synchronizes their holders when the acting player takes animals', () => {
    const session = table(state => {
      state.players[0]!.resources.sheep = 0
      state.players[0]!.pastures = [pasture('acting-receiver')]
      state.players[2]!.resources.sheep = 4
      state.players[2]!.pastures = [pasture('teammate-giver', 4)]
    })
    expect(session.takeAction(0, 'marketplace').ok).toBe(true)
    const received = session.commitSelectionChoice(0, { marketplaceTransfers: [
      { resource: 'sheep', direction: 'take', teammatePlayerId: 'p3', amount: 2 },
    ] })
    expect(received.ok, received.error).toBe(true)
    expect(received.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'animal-reorg' } })
    if (received.interaction.stateId !== 'wait' || received.interaction.request.kind !== 'animal-reorg') throw new Error('Expected acting receiver arrangement')
    expect(received.state.players[2]!.resources.sheep).toBe(1)
    expect(received.state.players[2]!.pastures[0]).toMatchObject({ animalCount: 1, animalType: 'sheep' })
    const zones = received.interaction.request.zones
    assertRejectedUnchanged(session, () => session.resolveChoice(2, 'confirm', { zones }))
    const settled = session.resolveChoice(0, 'confirm', { zones })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.pastures[0]).toMatchObject({ animalCount: 2, animalType: 'sheep' })
    expect(settled.state.log.filter(entry => entry.key === 'log.marketplaceTransfer')).toEqual([
      expect.objectContaining({ playerId: 'p3', playerRefs: { giver: 'p3', receiver: 'p1' } }),
    ])
  })

})
