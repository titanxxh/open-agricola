import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { computeAnimalZones } from '../../domain/animal-zones'
import type { PlayerState } from '../../contract/types'

const setupGame = () => {
  const session = new GameSession(42)
  session.state.players.forEach((p: PlayerState) => {
    ;(p as any).minorHand = ['__test_placeholder__']
    ;(p as any).occupationHand = ['__test_placeholder__']
  })
  return { session, core: session }
}

describe('A148_Woolgrower', () => {
  it('emits a card zone with capacity = state.completedFeedingPhases', () => {
    const { core } = setupGame()
    core.state.completedFeedingPhases = 3
    core.state.players[0].occupationPlayed = ['A148_Woolgrower']

    const zones = computeAnimalZones(core.state.players[0], core.state)
    const z = zones.find((zz: any) => zz.cardId === 'A148_Woolgrower')
    expect(z).toBeDefined()
    expect(z!.capacity).toBe(3)
    expect(z!.animalType).toBe('sheep')
    expect(z!.zoneType).toBe('card')
  })

  it('emits no zone when completedFeedingPhases === 0', () => {
    const { core } = setupGame()
    core.state.completedFeedingPhases = 0
    core.state.players[0].occupationPlayed = ['A148_Woolgrower']

    const zones = computeAnimalZones(core.state.players[0], core.state)
    expect(zones.find((z: any) => z.cardId === 'A148_Woolgrower')).toBeUndefined()
  })

  it('played mid-game (no per-card counter) still reads global counter', () => {
    const { core } = setupGame()
    core.state.completedFeedingPhases = 2
    core.state.players[0].occupationPlayed = ['A148_Woolgrower']
    core.state.players[0].cardStates = {}

    const zones = computeAnimalZones(core.state.players[0], core.state)
    const z = zones.find((zz: any) => zz.cardId === 'A148_Woolgrower')
    expect(z!.capacity).toBe(2)
  })

  it('synced with B86: both cards read the same global counter', () => {
    const { core } = setupGame()
    core.state.completedFeedingPhases = 4
    core.state.players[0].occupationPlayed = ['A148_Woolgrower', 'B086_TruffleSearcher']

    const zones = computeAnimalZones(core.state.players[0], core.state)
    const a148 = zones.find((z: any) => z.cardId === 'A148_Woolgrower')
    const b86 = zones.find((z: any) => z.cardId === 'B086_TruffleSearcher')
    expect(a148?.capacity).toBe(4)
    expect(b86?.capacity).toBe(4)
  })
})
