import type { ActionDefinition } from '../../../contract/types'
import { incRoomsBuilt } from '../../../session/stats'

/**
 * Card-specific action for B85_FarmHand.
 * Increments the player's room count by 1 without placing a physical room tile.
 * This "virtual room" provides room for a person but NOT for animals.
 */
export const buildFarmhandRoomAction: ActionDefinition = {
  id: 'build-farmhand-room',
  nameKey: 'actions.build-farmhand-room.name',
  descriptionKey: 'actions.build-farmhand-room.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    player.rooms += 1
    incRoomsBuilt(player, 1)
    return { type: 'ok', logKey: 'log.buildFarmHandRoom' }
  },
}
