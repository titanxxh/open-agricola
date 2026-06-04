import { gainLeaf } from '../helpers/pay-gain-node'
import {
  readCardExtraData,
  writeCardExtraData,
} from '../helpers/card-state'
import { familySize } from '../../domain/player'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { B22_WalkingBoots } from '../../cards-display/B/B22_WalkingBoots'

const CARD_ID = B22_WalkingBoots.id

export const B22_WalkingBoots_impl = {
  prerequisiteCheck: (player) => familySize(player) <= 4,
  effect: {
    id: CARD_ID,
    onBuy: (_state, _player): ActionFlow => ({
      type: 'seq',
      children: [
        gainLeaf(CARD_ID, { food: 2 }),
        {
          type: 'leaf',
          actionId: 'place-farmer',
          sourceCard: CARD_ID,
          actionContext: {
            trueAction: false,
            extraPlacement: true,
            fromSupply: true,
            markForRemoval: true,
          },
        },
      ],
    }),
    onReturnHome: (state, player) => {
      const markedSpaceId = readCardExtraData<string>(
        player,
        CARD_ID,
        'markedSpaceId',
      )
      if (!markedSpaceId) return
      const space = state.actionSpaces.find((s) => s.id === markedSpaceId)
      if (!space) {
        writeCardExtraData(player, CARD_ID, 'markedSpaceId', undefined)
        return
      }
      // Find any worker of this player on the marked space and remove it.
      const taken = space.takenBy.find((t) => t.playerId === player.id)
      if (taken) {
        space.takenBy = space.takenBy.filter(
          (t) => !(t.playerId === player.id && t.workerId === taken.workerId),
        )
        const worker = (player.workers ?? []).find((w) => w.id === taken.workerId)
        if (worker) {
          worker.isActive = false
          worker.isNewborn = false
          worker.removedFromSupply = true
        }
      }
      writeCardExtraData(player, CARD_ID, 'markedSpaceId', undefined)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
