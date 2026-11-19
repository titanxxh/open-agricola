// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { ClientInteractionState } from '../../../shared/contract/protocol/game'
import type { InteractionAnimalReorgZone } from '../../../shared/contract/types'
import { useReserveCookingDraftPresentation } from '../reserve-cooking-draft-presentation'

it('lets recipes from the same source share the available and unassigned animal budget', () => {
  const interaction: ClientInteractionState = {
    stateId: 'wait',
    playerIndex: 0,
    spaceId: 'horse-market',
    requestKey: 'horse-market-reorg',
    allowedCommands: ['resolveChoice'],
    anytimeActions: [],
    request: {
      kind: 'animal-reorg',
      zones: [],
      reserveCooking: {
        available: { horse: 3 },
        catalog: [
          { sourceId: 'M106_HorseButchery', exchangeIndex: 3, from: { horse: 1 }, to: { food: 2 }, max: 3 },
          { sourceId: 'M106_HorseButchery', exchangeIndex: 4, from: { horse: 2 }, to: { food: 5 }, max: 1 },
        ],
      },
    },
  }
  const { result } = renderHook(() => useReserveCookingDraftPresentation({
    interaction,
    zones: [],
    remaining: { sheep: 0, boar: 0, cattle: 0, horse: 3 },
    isInteractive: true,
    locale: 'en',
    cardLabel: id => id,
  }))
  act(() => result.current.open?.())
  const oneHorse = 'M106_HorseButchery-ex3'
  const twoHorses = 'M106_HorseButchery-ex4'
  act(() => result.current.overlay?.updateCount(oneHorse, 1))
  act(() => result.current.overlay?.updateCount(twoHorses, 1))
  expect(result.current.selections).toEqual([
    { sourceId: 'M106_HorseButchery', exchangeIndex: 3, count: 1 },
    { sourceId: 'M106_HorseButchery', exchangeIndex: 4, count: 1 },
  ])
  expect(result.current.overlay).toMatchObject({
    canConfirm: true,
    food: 7,
    limitById: { [oneHorse]: 1, [twoHorses]: 1 },
  })
})

it('withholds the cooking entry and confirmation when the draft occupies every zone in a required-empty group', () => {
  const firstPen: InteractionAnimalReorgZone = {
    id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 1, capacity: 2, requiredEmptyZoneGroupIds: ['pen'],
  }
  const secondPen: InteractionAnimalReorgZone = { ...firstPen, id: 'p2', animalType: null, animalCount: 0 }
  const draftZones = [firstPen, secondPen]
  const interaction: ClientInteractionState = {
    stateId: 'wait',
    playerIndex: 0,
    spaceId: 'sheep-market',
    requestKey: 'sheep-market-reorg',
    allowedCommands: ['resolveChoice'],
    anytimeActions: [],
    request: {
      kind: 'animal-reorg',
      zones: draftZones,
      reserveCooking: {
        available: { sheep: 1 },
        catalog: [{ sourceId: 'Major_Fireplace1', exchangeIndex: 0, from: { sheep: 1 }, to: { food: 2 }, max: 1 }],
      },
    },
  }
  const { result, rerender } = renderHook(({ zones }) => useReserveCookingDraftPresentation({
    interaction,
    zones,
    remaining: { sheep: 1, boar: 0, cattle: 0, horse: 0 },
    isInteractive: true,
    locale: 'en',
    cardLabel: id => id,
  }), { initialProps: { zones: draftZones } })
  act(() => result.current.open?.())
  act(() => result.current.overlay?.updateCount('Major_Fireplace1-ex0', 1))
  expect(result.current.overlay?.canConfirm).toBe(true)

  rerender({ zones: [firstPen, { ...secondPen, animalType: 'sheep', animalCount: 1 }] })
  expect(result.current.open).toBeUndefined()
  expect(result.current.overlay?.canConfirm).toBe(false)
})
