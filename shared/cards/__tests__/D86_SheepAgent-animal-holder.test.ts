import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../contract/types'
import type { AnimalZone } from '../../domain/animal-zones'
import { D086_SheepAgent_impl } from '../D/D086_SheepAgent'
import { getCardDefinitionById } from '../helpers/card-type'

const CARD_ID = 'D086_SheepAgent'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState =>
  ({
    improvements: [],
    minorPlayed: [],
    occupationPlayed: [],
    cardStates: {},
    ...overrides,
  }) as unknown as PlayerState

const sheepAgentCapacity = (player: PlayerState): number => {
  const zones: AnimalZone[] = []
  D086_SheepAgent_impl.effect.onComputeAnimalZones!(player, zones, {} as GameState)
  return zones.find((zone) => zone.id === `card:${CARD_ID}`)?.capacity ?? 0
}

describe('D086_SheepAgent animal-holder identity filtering', () => {
  it('counts itself as one occupation even though it is an animal holder', () => {
    expect(getCardDefinitionById(CARD_ID)?.animalHolder).toBe(true)
    expect(sheepAgentCapacity(makePlayer({ occupationPlayed: [CARD_ID] }))).toBe(1)
  })

  it('subtracts played animal-holder cards with occupation identity', () => {
    expect(getCardDefinitionById('E086_PenBuilder')?.animalHolder).toBe(true)
    expect(sheepAgentCapacity(makePlayer({
      occupationPlayed: [CARD_ID, 'E144_WaresSalesman', 'E086_PenBuilder'],
    }))).toBe(2)
  })

  it('does not subtract played animal-holder cards without occupation identity', () => {
    expect(getCardDefinitionById('E011_PettingZoo')?.animalHolder).toBe(true)
    expect(sheepAgentCapacity(makePlayer({
      occupationPlayed: [CARD_ID, 'E144_WaresSalesman'],
      minorPlayed: ['E011_PettingZoo'],
    }))).toBe(2)
  })

  it('does not subtract played cards without animal-holder metadata', () => {
    expect(getCardDefinitionById('E144_WaresSalesman')?.animalHolder).toBeUndefined()
    expect(sheepAgentCapacity(makePlayer({
      occupationPlayed: [CARD_ID, 'E144_WaresSalesman'],
    }))).toBe(2)
  })
})
