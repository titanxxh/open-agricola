import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Resource } from '../../game/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C116_FurnitureMaker'

// 7b1 migration: listens on `actions: ['pay']` with `costType === 'occupation'`
// instead of the legacy `actions: ['play-occupation']` after-listener that
// reconstructed the lessons cost from spaceId + occupation count. The new
// listener reads the real `extraData.resourcesPaid.food` written by the pay
// leaf, so:
//   - lessons-4 + B109 PaperMaker trade (player swaps wood→food and the
//     actual resourcesPaid is { wood: 1 }, food: 0) correctly emits 0 wood.
//   - cost-discount modifiers reduce food paid; C116's wood gain shrinks in
//     lockstep without any special-case logic here.
//   - listener never fires for C116's own play (sourceCard === CARD_ID),
//     mirroring the legacy `choice === CARD_ID` guard.
const afterPayListener: CardListenerRegistration = {
  id: 'C116-furniture-maker-after-pay',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['pay'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const ctx = context as unknown as {
      costType?: string
      result?: { extraData?: { resourcesPaid?: Partial<Resource> } }
      sourceCard?: string
    }
    if (ctx.costType !== 'occupation') return
    if (ctx.sourceCard === CARD_ID) return
    const foodPaid = ctx.result?.extraData?.resourcesPaid?.food ?? 0
    if (foodPaid <= 0) return
    return { flow: gainLeaf(CARD_ID, { wood: foodPaid }), sourceCard: CARD_ID }
  },
}

export const C116_FurnitureMaker = new Occupation({
  id: CARD_ID,
  name: 'Furniture Maker',
  deck: 'C',
  number: 116,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <WOOD>. Each time you play an occupation after this one, you get 1 <WOOD> for each <FOOD> paid as occupation cost.',
  ],
  cost: {},
  players: '1+',
})

export const C116_FurnitureMaker_impl = {
  listeners: [afterPayListener],
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { wood: 1 }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
