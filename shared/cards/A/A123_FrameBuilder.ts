import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { PlayerState, TradeModifier } from '../../game/types'
import { canAffordCost } from '../../actions/effects/pay-helpers'
import { getBuildRoomCost } from '../../actions/effects/room-payment'
import { getRenovation } from '../../actions/effects/renovation'

const CARD_ID = 'A123_FrameBuilder'

const buildConstructOptions = (player: PlayerState) => {
  const baseCost = getBuildRoomCost(player.houseType)
  const options = [{ ...baseCost }]
  if ((baseCost.wood ?? 0) >= 1) {
    options.push({ ...baseCost, wood: (baseCost.wood ?? 0) - 1, clay: (baseCost.clay ?? 0) + 2 })
    options.push({ ...baseCost, wood: (baseCost.wood ?? 0) - 1, stone: (baseCost.stone ?? 0) + 2 })
  }
  if ((baseCost.clay ?? 0) >= 2) {
    options.push({ ...baseCost, clay: (baseCost.clay ?? 0) - 2, wood: (baseCost.wood ?? 0) + 1 })
  }
  if ((baseCost.stone ?? 0) >= 2) {
    options.push({ ...baseCost, stone: (baseCost.stone ?? 0) - 2, wood: (baseCost.wood ?? 0) + 1 })
  }
  return options
}

const buildRenovationOptions = (player: PlayerState) => {
  const renovation = getRenovation(player)
  if (!renovation) return []
  const baseCost = renovation.cost
  const options = [{ ...baseCost }]
  if ((baseCost.clay ?? 0) >= 2) {
    options.push({ ...baseCost, clay: (baseCost.clay ?? 0) - 2, wood: (baseCost.wood ?? 0) + 1 })
  }
  if ((baseCost.stone ?? 0) >= 2) {
    options.push({ ...baseCost, stone: (baseCost.stone ?? 0) - 2, wood: (baseCost.wood ?? 0) + 1 })
  }
  return options
}

const isDoableListener: CardListenerRegistration = {
  id: 'A123-frame-builder-isdoable-building',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['construct', 'renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    const options =
      context.actionId === 'construct'
        ? buildConstructOptions(context.player)
        : buildRenovationOptions(context.player)
    if (options.some((cost) => canAffordCost(context.player, cost))) {
      return { doable: true }
    }
  },
}

registerCardListener(isDoableListener)

export const A123_FrameBuilder = new Occupation({
  id: CARD_ID,
  name: "Frame Builder",
  deck: "A",
  number: 123,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time you build a room/renovate, but only once per room/action, you can replace exactly 2 <CLAY> or 2 <STONE> with 1 <WOOD>."],
  cost: {},
  players: "1+",
  modifiers: [
    {
      type: 'trade',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      from: { clay: 2 },
      to: { wood: 1 },
      max: 1,
    },
    {
      type: 'trade',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      from: { stone: 2 },
      to: { wood: 1 },
      max: 1,
    },
    {
      type: 'trade',
      cardId: CARD_ID,
      appliesTo: ['construct', 'renovation'],
      from: { wood: 1 },
      to: { clay: 2 },
      max: 2,
    },
    {
      type: 'trade',
      cardId: CARD_ID,
      appliesTo: ['construct', 'renovation'],
      from: { wood: 1 },
      to: { stone: 2 },
      max: 2,
    },
  ] as TradeModifier[],
})
