import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { ActionDefinition, ActionFlow, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C67_MineralFeeder'
const POST_REORG_CHECK_ACTION_ID = 'card_C67_MineralFeeder_checkAndGain'

const harvestRounds = [4, 7, 9, 11, 13, 14]

/**
 * C67 Mineral Feeder — At the start of each round that does not end with a harvest,
 * if you have at least 1 sheep in a pasture, you get 1 grain.
 *
 * BGA reference: onPlayerStartOfTurn — checks pastures for sheep.
 */

const hasSheepInPasture = (player: PlayerState): boolean =>
  player.pastures.some(
    (pasture) => pasture.animalType === 'sheep' && pasture.animalCount > 0,
  )

const hasSheepAnywhere = (player: PlayerState): boolean =>
  (player.resources.sheep ?? 0) > 0 ||
  (player.houseAnimalType === 'sheep' && player.houseAnimalCount > 0) ||
  Object.values(player.stableAnimals ?? {}).some((animal) => animal === 'sheep') ||
  hasSheepInPasture(player)

const hasPasture = (player: PlayerState): boolean =>
  player.pastures.length > 0

const postReorgCheckAction: ActionDefinition = {
  id: POST_REORG_CHECK_ACTION_ID,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    if (!hasSheepInPasture(player)) return { type: 'ok' }
    return { type: 'flow', flow: gainLeaf(CARD_ID, { grain: 1 }) }
  },
}

registerAdHocAction(postReorgCheckAction)

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBeforeStartOfTurn: (state, player): ActionFlow | undefined => {
      if (harvestRounds.includes(state.round)) return
      if (hasSheepInPasture(player)) return gainLeaf(CARD_ID, { grain: 1 })
      if (!hasSheepAnywhere(player) || !hasPasture(player)) return
      return {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'reorganize',
            sourceCard: CARD_ID,
            actionContext: { trigger: 'anytime' },
          },
          {
            type: 'leaf',
            actionId: POST_REORG_CHECK_ACTION_ID,
            sourceCard: CARD_ID,
          },
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C67_MineralFeeder = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Mineral Feeder',
    deck: 'C',
    number: 67,
    category: 'CROP_PROVIDER',
    desc: ['At the start of each round that does not end with a harvest, if you have at least 1 <SHEEP> in a pasture, you get 1 <GRAIN>.'],
    cost: { reed: 1 },
    vp: 1,
  },
  impl: cardImpl,
})

export const C67_MineralFeeder_impl = C67_MineralFeeder.impl
