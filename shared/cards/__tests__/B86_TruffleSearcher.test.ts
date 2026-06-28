import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { computeAnimalZones } from '../../domain/animal-zones'
import type { PlayerState } from '../../contract/types'

const setupGame = () => {
  const session = new GameSession(42)
  const core = session as any
  core.state.players.forEach((p: PlayerState) => {
    ;(p as any).minorHand = ['__test_placeholder__']
    ;(p as any).occupationHand = ['__test_placeholder__']
  })
  return { session, core }
}

describe('B086_TruffleSearcher', () => {
  it('emits a card zone with capacity = state.completedFeedingPhases', () => {
    const { core } = setupGame()
    core.state.completedFeedingPhases = 3
    core.state.players[0].occupationPlayed = ['B086_TruffleSearcher']

    const zones = computeAnimalZones(core.state.players[0], core.state)
    const z = zones.find((zz: any) => zz.cardId === 'B086_TruffleSearcher')
    expect(z).toBeDefined()
    expect(z!.capacity).toBe(3)
    expect(z!.animalType).toBe('boar')
    expect(z!.zoneType).toBe('card')
  })

  it('emits no zone when completedFeedingPhases === 0', () => {
    const { core } = setupGame()
    core.state.completedFeedingPhases = 0
    core.state.players[0].occupationPlayed = ['B086_TruffleSearcher']

    const zones = computeAnimalZones(core.state.players[0], core.state)
    expect(zones.find((z: any) => z.cardId === 'B086_TruffleSearcher')).toBeUndefined()
  })
})
