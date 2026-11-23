import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../../actions/helpers/placement-constants'
import { buildCardAnimalZoneId } from '../../../domain/animal-zones'
import { getFarmyardTilePositions, positionKey } from '../../../domain/farm'
import { getUsedFarmyardTileKeys } from '../../../domain/farmyard-usage'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'

const CARD_ID = 'CWM013_Cowboy'

const animals: Record<string, 'sheep' | 'boar' | 'cattle'> = {
  'sheep-market': 'sheep',
  'pig-market': 'boar',
  'cattle-market': 'cattle',
}
const TAKE = 'card_' + CARD_ID + '_take'
registerAdHocAction({
  id: TAKE,
  nameKey: 'actions.gain.name',
  descriptionKey: 'actions.gain.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ space }) =>
    animals[space.id]
      ? { type: 'flow', flow: gainLeaf(CARD_ID, { [animals[space.id]!]: 1 }) }
      : { type: 'fail', errorKey: 'log.action' },
})
const cardImpl = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (player, zones) => {
      const used = getUsedFarmyardTileKeys(player)
      for (const tile of getFarmyardTilePositions(player).filter(
        (tile) => !used.has(positionKey(tile)),
      ))
        zones.push({
          id: buildCardAnimalZoneId(CARD_ID, tile),
          zoneType: 'card',
          cardId: CARD_ID,
          capacity: 2,
          animalCount: 0,
          farmPosition: tile,
          countsFarmyardSpaceAsUnused: true,
          displaySource: 'farm-position',
          occupiedZoneLimit: 1,
        })
    },
  },
  listeners: [
    {
      id: CARD_ID + '-occupied',
      cardIds: [CARD_ID],
      actions: ['place-farmer'],
      phases: ['computeArgs'],
      handler: ({ state }) => ({
        sourceCard: CARD_ID,
        extraOptions: state.actionSpaces
          .filter((s) => animals[s.id] && s.takenBy.length > 0)
          .map((s) => ({
            value: OCCUPIED_SPACE_CHOICE_PREFIX + s.id,
            labelKey: s.nameKey,
            sourceCard: CARD_ID,
          })),
      }),
    },
    {
      // Whoever occupies the market, a use that finds another person there gets 1 animal instead
      // of the pile; the person making this use is the placed or moved one, absent while admitting.
      id: CARD_ID + '-animal',
      cardIds: [CARD_ID],
      actionSpaces: Object.keys(animals),
      phases: ['computeReplace'],
      handler: ({ space, player, actionSpaceUse, actionContext }) => {
        const person = actionSpaceUse?.personUse?.workerId ?? actionContext?.workerId
        if (
          actionContext?.checkedReplaceAction ||
          !space.takenBy.some((ref) => ref.playerId !== player.id || ref.workerId !== person)
        )
          return
        return { actionId: TAKE, sourceCard: CARD_ID }
      },
    },
  ],
} satisfies CardImpl

export const CWM013_Cowboy = defineOccupationCard({
  meta: {
    id: 'CWM013_Cowboy',
    name: "Cowboy",
    deck: 'CWM',
    number: 13,
    desc: ["You may use an occupied __Sheep Market__, __Pig Market__, or __Cattle Market__ accumulation space to get 1 animal of that type. You may keep up to 2 animals of one type on one unused farmyard space; that space still counts as unused."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM013.png',
  },
  impl: cardImpl,
})

export const CWM013_Cowboy_impl = CWM013_Cowboy.impl
