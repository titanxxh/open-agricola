import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import {
  readCardExtraData,
  writeCardExtraData,
} from '../helpers/card-state'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import { familySize } from '../../domain/player'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B22_WalkingBoots'

// BGA isBuyable: countFarmers() == 5 → false. We mirror via familySize() which
// counts active workers (the equivalent of BGA's "farmers").
registerPrerequisite('At Most 4 People', (player) => familySize(player) <= 4)

/**
 * B22 Walking Boots — Minor Improvement
 *
 * BGA `B22_WalkingBoots::onBuy` returns NODE_SEQ children:
 *   1. gainNode([FOOD => 2])
 *   2. PLACE_FARMER args { fromSupply: true, source, markForRemoval: true }
 *
 * The placed farmer is "marked for removal": at the start of the next
 * returning-home phase, BGA removes it from play (deactivates) and returns
 * it to the supply. Our previous implementation truncated to gainLeaf food:2
 * only and tagged the card `passing: true` to mask the missing behavior.
 *
 * Implementation:
 *   - onBuy emits SEQ(gain food:2, place-farmer fromSupply markForRemoval).
 *     The `place-farmer` leaf carries `actionContext.fromSupply` (already
 *     supported by `placeFarmerAction.execute`) and `markForRemoval` (handled
 *     by `placeFarmerAction.resolveChoice`, which writes the chosen spaceId
 *     to `cardStates[B22].extraData.markedSpaceId`).
 *   - onReturnHome reads markedSpaceId, finds the worker on that space,
 *     deactivates it, removes it from the action space's takenBy, and
 *     clears the flag so the effect is one-shot per buy.
 */

export const B22_WalkingBoots = new MinorImprovement({
  id: CARD_ID,
  name: 'Walking Boots',
  deck: 'B',
  number: 22,
  category: 'ACTIONS_BOOSTER',
  desc: ['You immediately get 2 <FOOD>. You must immediately place a person from your supply. If you do, in the next returning home phase, you must remove that person from play.'],
  cost: {},
  prerequisite: 'At Most 4 People',
})

export const B22_WalkingBoots_impl = {
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
        }
      }
      writeCardExtraData(player, CARD_ID, 'markedSpaceId', undefined)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
