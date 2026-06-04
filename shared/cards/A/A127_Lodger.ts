import { defineOccupationCard } from '../card-source'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'A127_Lodger'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    if (state.round <= 9) {
      writeCardExtraData(player, CARD_ID, 'hasRoom', true)
    }
  },
  computeExtraRoomCapacity: (player) => {
    const hasRoom = readCardExtraData<boolean>(player, CARD_ID, 'hasRoom') ?? false
    return hasRoom ? 1 : 0
  },
  onStartReturnHome: (state, player) => {
    if (state.round !== 9) return
    const hasRoom = readCardExtraData<boolean>(player, CARD_ID, 'hasRoom') ?? false
    if (!hasRoom) return
    // Check if rooms without Lodger extra capacity < familySize
    const roomsWithoutLodger = player.rooms
    if (roomsWithoutLodger < familySize(player)) {
      // Deactivate the highest-id active worker (the most recently added).
      // Prefer a worker currently at home so we don't strand a placed WorkerRef.
      const active = (player.workers ?? []).filter((w) => w.isActive)
      const homeActive = active.filter((w) => {
        return !state.actionSpaces.some((s) =>
          s.takenBy.some((t) => t.playerId === player.id && t.workerId === w.id),
        )
      })
      const pool = homeActive.length > 0 ? homeActive : active
      const victim = [...pool].sort((a, b) => Number(b.id) - Number(a.id))[0]
      if (victim) {
        victim.isActive = false
        victim.isNewborn = false
      }
    }
    writeCardExtraData(player, CARD_ID, 'hasRoom', false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A127_Lodger = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Lodger',
    deck: 'A',
    number: 127,
    category: 'FARM_PLANNER',
    desc: ['This card provides room for one person, but only until the returning home phase of round 9. If, by then, there is no room elsewhere for that person, remove it from play.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const A127_Lodger_impl = A127_Lodger.impl
