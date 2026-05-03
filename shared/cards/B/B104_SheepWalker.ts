import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B104_SheepWalker'

// Reorg-pending exchange suppression note:
//   BGA `getExchanges` returns [] while animals sit in the "reserve" (pending
//   reorg). Our `buildAnytimeEntries` already returns [] when the engine emits
//   a choice with promptKey 'ui.interactionAnimalReorg', so anytime exchanges
//   are naturally suppressed during reorg — no extra filter needed.

export const B104_SheepWalker = new Occupation({
  id: CARD_ID,
  name: 'Sheep Walker',
  deck: 'B',
  number: 104,
  category: 'GOODS_PROVIDER',
  desc: [
    'At any time, you can exchange 1 <SHEEP> on your farmyard for either 1 <PIG>, 1 <VEGETABLE>, or 1 <STONE>.',
  ],
  cost: {},
  players: '1+',
  exchanges: [
    { from: { sheep: 1 }, to: { boar: 1 }, triggers: ['anytime'] },
    { from: { sheep: 1 }, to: { vegetable: 1 }, triggers: ['anytime'] },
    { from: { sheep: 1 }, to: { stone: 1 }, triggers: ['anytime'] },
  ],
})

export const B104_SheepWalker_impl = {
  effect: {
    id: CARD_ID,
    // Mirrors BGA `B104_SheepWalker::enforceReorganizeOnLastHarvest`. Forces
    // a reorg choice (promptKey 'ui.interactionAnimalReorg') on the round-14
    // harvest when at least one sheep is anywhere on the farm so the player
    // has a final chance to evict / accommodate sheep before scoring (the
    // desc-rule "must be accommodated before being exchanged" implication).
    enforceReorganizeOnLastHarvest: (_state, player) => player.resources.sheep > 0,
  },
} satisfies CardImpl
