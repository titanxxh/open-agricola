import type { CardImpl } from '../registry'
import { B104_SheepWalker } from '../../cards-display/B/B104_SheepWalker'

const CARD_ID = B104_SheepWalker.id

export const B104_SheepWalker_impl = {
  effect: {
    id: CARD_ID,
    // Mirrors BGA `B104_SheepWalker::enforceReorganizeOnLastHarvest`. Forces
    // a reorg interaction (request.kind === 'animal-reorg') on the round-14
    // harvest when at least one sheep is anywhere on the farm so the player
    // has a final chance to evict / accommodate sheep before scoring (the
    // desc-rule "must be accommodated before being exchanged" implication).
    enforceReorganizeOnLastHarvest: (_state, player) => player.resources.sheep > 0,
  },
} satisfies CardImpl
