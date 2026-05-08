import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { A127_Lodger } from '../../cards-display/A/A127_Lodger'
export { A127_Lodger }

const CARD_ID = A127_Lodger.id

export const A127_Lodger_impl = {
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
