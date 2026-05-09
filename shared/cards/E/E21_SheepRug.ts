import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption, PlayerState } from '../../contract/types'
import { isSpaceOccupied } from '../../domain/space'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/helpers/placement-constants'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { E21_SheepRug } from '../../cards-display/E/E21_SheepRug'

const CARD_ID = E21_SheepRug.id

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

export const E21_SheepRug_impl = {
  listeners: [computeArgsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
