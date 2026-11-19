import type { CardEffect } from '../card-effects'
import type { PlayerState } from '../../contract/types'
import { readCardExtraData } from './card-state'
import type { AnimalKey } from '../../contract/animals'

export const fixedCardAnimals = (cardId: string) => {
  const counts = (player: PlayerState) =>
    readCardExtraData<Partial<Record<AnimalKey, number>>>(player, cardId, 'fixedAnimals') ?? {}
  return {
    counts,
    effect: {
      getStatePresentation: player => ({
        animalMarkers: Object.entries(counts(player)).flatMap(([animal, count]) =>
          count > 0 ? [{ animal: animal as AnimalKey, count }] : []),
      }),
      computeResourceCommitments: (_state, player) => [
        { playerId: player.id, resources: counts(player) },
      ],
      onComputeAnimalZones: (player, zones) => {
        const animals = counts(player)
        const total = Object.values(animals).reduce((sum, value) => sum + value, 0)
        if (!total) return
        zones.push({
          id: 'card:' + cardId,
          zoneType: 'card',
          cardId,
          capacity: total,
          animalCounts: animals,
          animalCount: total,
          allowedAnimalType: null,
          minimumAnimalCounts: animals,
        })
      },
    } satisfies Pick<CardEffect, 'computeResourceCommitments' | 'onComputeAnimalZones' | 'getStatePresentation'>,
  }
}
