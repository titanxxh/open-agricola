import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { PlayerState } from '../../game/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { initCardState } from '../__stubs__/helpers'
import { writeCardInfobox } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'C148_MudWallower'

/**
 * C148 Mud Wallower:
 * Every fourth time you use an accumulation space, you get 1 PIG, held by this card.
 *
 * BGA: Tracks a counter and held pig count. On every farmer placement on an
 * accumulation space, increments counter. At 4, gains 1 pig and resets.
 * The card acts as an animal holder zone for pigs.
 *
 * Implementation:
 * - onBuy: initialize counter to 0, held to 0
 * - after place-farmer on accumulation space: increment counter, if >=4 gain pig
 * - onComputeAnimalZones: provide pig holder zone with capacity = held count
 */

const isAccumulationSpace = (context: CardListenerContext): boolean => {
  if (!context.space) return false
  const gainPerRound = context.space.gainPerRound ?? {}
  return Object.values(gainPerRound).some((v) => (v ?? 0) > 0)
}

const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'C148-mud-wallower-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isAccumulationSpace(context)) return

    const counters = initCardState(context.player, CARD_ID)
    counters.counter = (counters.counter ?? 0) + 1
    writeCardInfobox(context.player, CARD_ID, `${counters.counter % 4} / 4`)

    if (counters.counter >= 4) {
      counters.counter -= 4
      counters.held = (counters.held ?? 0) + 1
      writeCardInfobox(context.player, CARD_ID, `${counters.counter % 4} / 4`)
      return { flow: gainLeaf(CARD_ID, { boar: 1 }), sourceCard: CARD_ID }
    }
  },
}

/**
 * Sync C148.held downward when player's pig count is below the cap.
 *
 * BGA: when pigs leave the card (via cooking/exchange, paying, reorganize),
 * the card's capacity is permanently reduced (`decreaseRoom` / `decreaseRoomAll`).
 * We approximate by syncing `held` to `min(held, player.resources.boar)` after
 * actions that can move pigs off the card. The sync only goes downward — the
 * cap never grows back even if pig count later rises (e.g., via breeding).
 */
const syncHeldDownward = (player: PlayerState) => {
  const counters = player.cardStates?.[CARD_ID]?.counters
  if (!counters) return
  const held = counters.held ?? 0
  if (held <= 0) return
  const boars = player.resources.boar ?? 0
  if (boars < held) {
    counters.held = boars
  }
}

const afterExchangeSyncListener: CardListenerRegistration = {
  id: 'C148-mud-wallower-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['exchange'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    syncHeldDownward(context.player)
  },
}

const syncHeldAfterPlaceFarmerListener: CardListenerRegistration = {
  id: 'C148-mud-wallower-sync-held-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  // Order > 0 so it runs after the increment listener (which has default order 0).
  order: 10,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    syncHeldDownward(context.player)
  },
}

/**
 * 7b1 PR-4 migration: cover any pay path that drains pigs (BeggingCard pay,
 * cooking pay, future improvement-buy pay variants paying boar). When the
 * pay leaf reports `resourcesPaid.boar > 0`, sync the held cap downward to
 * match `min(held, boar)`. Always-permanent: never raises the cap.
 */
const afterPaySyncListener: CardListenerRegistration = {
  id: 'C148-mud-wallower-after-pay-sync',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['pay'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const result = context.result
    if (!result || result.type !== 'ok') return
    const resourcesPaid = (result.resourcesPaid as { boar?: number } | undefined) ?? {}
    if (!resourcesPaid.boar || resourcesPaid.boar <= 0) return
    syncHeldDownward(context.player)
  },
}

export const C148_MudWallower = new Occupation({
  id: CARD_ID,
  name: 'Mud Wallower',
  deck: 'C',
  number: 148,
  category: 'FARM_PLANNER',
  desc: ['Every fourth time you use an accumulation space, you get 1 <PIG>, held by this card.'],
  cost: {},
  players: '4+',
  evenMoreSet: true,
  extraVp: true,
})

export const C148_MudWallower_impl = {
  listeners: [afterPlaceFarmerListener, afterExchangeSyncListener, syncHeldAfterPlaceFarmerListener, afterPaySyncListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const counters = initCardState(player, CARD_ID)
    counters.counter = 0
    counters.held = 0
    writeCardInfobox(player, CARD_ID, '0 / 4')
  },
  onComputeAnimalZones: (player, zones) => {
    const held = player.cardStates?.[CARD_ID]?.counters?.held ?? 0
    if (held <= 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      cardId: CARD_ID,
      capacity: held,
      animalType: 'boar',
      animalCount: 0,
    })
  },
  /**
   * BGA `Cards/C/C148_MudWallower.php::getInvalidAnimals` returns []:
   * the held counter manages capacity; zone constraint is PIG-only via
   * onPlayerComputeDropZones. Mirror BGA exactly.
   */
  getInvalidAnimals: () => [],
},
  reaches: [] as readonly string[],
} satisfies CardImpl
