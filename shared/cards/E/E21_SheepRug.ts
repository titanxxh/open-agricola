import { MinorImprovement } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption, PlayerState } from '../../contract/types'
import { isSpaceOccupied } from '../../game/space'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/helpers/placement-constants'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'E21_SheepRug'

const countSheepOnBoard = (player: PlayerState): number => {
  let total = 0
  for (const pasture of player.pastures) {
    if (pasture.animalType === 'sheep') total += pasture.animalCount
  }
  if (player.houseAnimalType === 'sheep') total += player.houseAnimalCount
  for (const animal of Object.values(player.stableAnimals ?? {})) {
    if (animal === 'sheep') total += 1
  }
  return total
}

// BGA isBuyable: countAnimalsOnBoard()[SHEEP] < 4 → false
registerPrerequisite('4 Sheep', (player) => countSheepOnBoard(player) >= 4)
const WISH_SPACE_IDS = ['wish-children', 'urgent-wish-children']

const computeArgsListener: CardListenerRegistration = {
  id: 'E21-sheep-rug-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const extraOptions: ActionChoiceOption[] = []
    for (const spaceId of WISH_SPACE_IDS) {
      const space = context.state.actionSpaces.find((s) => s.id === spaceId)
      if (!space) continue
      if (!isSpaceOccupied(space)) continue
      if (!space.canBeExecutedByPlayer(context.state, context.player)) continue
      extraOptions.push({
        value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${spaceId}`,
        labelKey: space.nameKey,
      })
    }
    if (extraOptions.length === 0) return
    return { extraOptions, sourceCard: CARD_ID }
  },
}

export const E21_SheepRug = new MinorImprovement({
  id: CARD_ID,
  name: 'Sheep Rug',
  deck: 'E',
  number: 21,
  category: 'ACTION_-_FAMILY_GROWTH',
  desc: ["You can use any __Wish for Children__ action space, even if it is occupied by another player's person."],
  vp: 1,
  cost: { sheep: 1 },
  prerequisite: '4 Sheep',
})

export const E21_SheepRug_impl = {
  listeners: [computeArgsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
