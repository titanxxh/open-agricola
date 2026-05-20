import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, PlayerState } from '../../contract/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { initCardState } from '../__stubs__/helpers'
import { sumResourcePaid } from '../helpers/event-provenance'
import { writeCardInfobox } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { C148_MudWallower } from '../../cards-display/C/C148_MudWallower'

const CARD_ID = C148_MudWallower.id

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

const specialEffect = (params: Record<string, unknown>): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params,
})

const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'C148-mud-wallower-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isAccumulationSpace(context)) return

    const current = context.player.cardStates?.[CARD_ID]?.counters ?? {}
    const counter = current.counter ?? 0
    const held = current.held ?? 0
    const nextCounter = counter + 1

    if (nextCounter >= 4) {
      const resetCounter = nextCounter - 4
      return {
        flow: {
          type: 'seq',
          children: [
            specialEffect({ kind: 'set-counter', key: 'counter', value: resetCounter }),
            specialEffect({ kind: 'set-counter', key: 'held', value: held + 1 }),
            specialEffect({ kind: 'set-infobox', text: `${resetCounter % 4} / 4` }),
            gainLeaf(CARD_ID, { boar: 1 }),
          ],
        },
        sourceCard: CARD_ID,
      }
    }
    return {
      flow: {
        type: 'seq',
        children: [
          specialEffect({ kind: 'set-counter', key: 'counter', value: nextCounter }),
          specialEffect({ kind: 'set-infobox', text: `${nextCounter % 4} / 4` }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

/**
 * Sync C148.held downward when fewer pigs remain on the card than the
 * permanent capacity. BGA semantic: `decreaseRoom` — each pig that moves
 * off the card permanently reduces capacity; pigs returning later (e.g.
 * via breeding) do NOT restore it.
 *
 * Zone-based formula: pigsInC148 = boar − pasture_boars − house_boars − stable_boars.
 * Mathematically equivalent to the legacy `min(held, total_boars)` approximation
 * on pay / exchange / place-farmer paths (those paths reduce total_boars
 * without redistributing zones, so the subtraction reduces by the same amount).
 * Correct on the reorg path where zones change but total_boars does not.
 */
const computePigsInC148 = (player: PlayerState): number => {
  const pastureBoars = player.pastures
    .filter((p) => p.animalType === 'boar')
    .reduce((sum, p) => sum + p.animalCount, 0)
  const houseBoars = player.houseAnimalType === 'boar' ? player.houseAnimalCount : 0
  const stableBoars = Object.values(player.stableAnimals ?? {})
    .filter((t) => t === 'boar').length
  return Math.max(
    0,
    (player.resources.boar ?? 0) - pastureBoars - houseBoars - stableBoars,
  )
}

const syncHeldDownwardFlow = (player: PlayerState): ActionFlow | undefined => {
  const counters = player.cardStates?.[CARD_ID]?.counters
  if (!counters) return undefined
  const held = counters.held ?? 0
  if (held <= 0) return undefined

  const pigsInC148 = computePigsInC148(player)
  if (pigsInC148 >= held) return undefined
  return specialEffect({ kind: 'set-counter', key: 'held', value: pigsInC148 })
}

const afterExchangeSyncListener: CardListenerRegistration = {
  id: 'C148-mud-wallower-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['exchange'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const flow = syncHeldDownwardFlow(context.player)
    return flow ? { flow, sourceCard: CARD_ID } : undefined
  },
}

const afterReorgSyncListener: CardListenerRegistration = {
  id: 'C148-mud-wallower-after-reorg',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['reorganize'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const flow = syncHeldDownwardFlow(context.player)
    return flow ? { flow, sourceCard: CARD_ID } : undefined
  },
}

const afterPaySyncListener: CardListenerRegistration = {
  id: 'C148-mud-wallower-after-pay-sync',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['pay'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const result = context.result
    if (!result || result.type !== 'ok') return
    const boarPaid = sumResourcePaid(context.actionEvents ?? context.transactionEvents, 'boar')
    if (boarPaid <= 0) return
    const flow = syncHeldDownwardFlow(context.player)
    return flow ? { flow, sourceCard: CARD_ID } : undefined
  },
}

export const C148_MudWallower_impl = {
  listeners: [afterPlaceFarmerListener, afterExchangeSyncListener, afterPaySyncListener, afterReorgSyncListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const counters = initCardState(player, CARD_ID)
    counters.counter = 0
    counters.held = 0
    writeCardInfobox(player, CARD_ID, '0 / 4')
  },
  onComputeAnimalZones: (player, zones, _state) => {
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
