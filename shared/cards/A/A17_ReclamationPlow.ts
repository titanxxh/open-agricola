import { MinorImprovement } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionFlow } from '../../game/types'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionSpace, PlayerState, Pasture } from '../../game/types'
import {
  isCardFlagged,
  readCardExtraData,
  setCardFlag,
  writeCardInfobox,
  writeCardExtraData,
} from '../helpers/card-state'
import type { CardImpl } from '../registry'

type AnimalType = 'sheep' | 'boar' | 'cattle'
const CARD_ID = 'A17_ReclamationPlow'
const ANIMALS_BEFORE_KEY = 'animalsBeforeCollecting'
const USED_INFOBOX = '✓'

const isAnimalAccumulationSpace = (space: ActionSpace): boolean => {
  const gainPerRound = space.gainPerRound ?? {}
  return (gainPerRound.sheep ?? 0) > 0 || 
         (gainPerRound.boar ?? 0) > 0 || 
         (gainPerRound.cattle ?? 0) > 0
}

const getAnimalCountByType = (player: PlayerState): Record<AnimalType, number> => {
  return {
    sheep: (player.houseAnimalType === 'sheep' ? player.houseAnimalCount : 0) +
      Object.values(player.stableAnimals ?? {}).filter((a) => a === 'sheep').length +
      (player.pastures ?? []).reduce((sum: number, p: Pasture) => sum + (p.animalType === 'sheep' ? p.animalCount : 0), 0),
    boar: (player.houseAnimalType === 'boar' ? player.houseAnimalCount : 0) +
      Object.values(player.stableAnimals ?? {}).filter((a) => a === 'boar').length +
      (player.pastures ?? []).reduce((sum: number, p: Pasture) => sum + (p.animalType === 'boar' ? p.animalCount : 0), 0),
    cattle: (player.houseAnimalType === 'cattle' ? player.houseAnimalCount : 0) +
      Object.values(player.stableAnimals ?? {}).filter((a) => a === 'cattle').length +
      (player.pastures ?? []).reduce((sum: number, p: Pasture) => sum + (p.animalType === 'cattle' ? p.animalCount : 0), 0),
  }
}

const buildReclamationPlowUseFlow = (ambiguous: boolean): ActionFlow => ({
  type: 'xor',
  promptKey: ambiguous
    ? 'ui.interactionReclamationPlowAmbiguous'
    : 'ui.interactionReclamationPlow',
  children: [
    {
      type: 'leaf',
      actionId: 'plow',
      sourceCard: CARD_ID,
      choiceLabelKey: 'ui.interactionReclamationPlowUse',
    },
    ambiguous
      ? {
          type: 'leaf',
          actionId: 'noop',
          choiceLabelKey: 'ui.interactionReclamationPlowDecline',
        }
      : {
          type: 'leaf',
          actionId: 'flag-card',
          sourceCard: CARD_ID,
          params: { infoboxText: USED_INFOBOX } as any,
          choiceLabelKey: 'ui.interactionReclamationPlowSkip',
        },
  ],
})

const reclamationPlowDuringListener: CardListenerRegistration = {
  id: 'A17-reclamation-plow-before',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { space, player } = context

    if (!isAnimalAccumulationSpace(space)) return
    if (isCardFlagged(player, CARD_ID)) return

    writeCardExtraData(player, CARD_ID, ANIMALS_BEFORE_KEY, getAnimalCountByType(player))
  },
}

const reclamationPlowAfterListener: CardListenerRegistration = {
  id: 'A17-reclamation-plow-after',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { space, player } = context

    if (!isAnimalAccumulationSpace(space)) return
    if (isCardFlagged(player, CARD_ID)) return

    const animalsBeforeCollecting = readCardExtraData<Record<AnimalType, number>>(
      player,
      CARD_ID,
      ANIMALS_BEFORE_KEY,
    )
    if (!animalsBeforeCollecting) return
    const resourcesGained =
      context.result?.type === 'ok' ? context.result.resourcesGained : undefined

    const obtainedAnimals: Record<AnimalType, number> = {
      sheep: resourcesGained?.sheep ?? 0,
      boar: resourcesGained?.boar ?? 0,
      cattle: resourcesGained?.cattle ?? 0,
    }
    const totalObtained = obtainedAnimals.sheep + obtainedAnimals.boar + obtainedAnimals.cattle
    if (totalObtained <= 0) return

    const animalsAfterCollecting = getAnimalCountByType(player)
    let ambiguous = false
    for (const animalType of ['sheep', 'boar', 'cattle'] as AnimalType[]) {
      const after = animalsAfterCollecting[animalType]
      const obtained = obtainedAnimals[animalType]

      if (after < obtained) {
        return
      }
      if (after < obtained + animalsBeforeCollecting[animalType]) {
        ambiguous = true
      }
    }

    return { flow: buildReclamationPlowUseFlow(ambiguous) }
  },
}

const reclamationPlowAfterPlowListener: CardListenerRegistration = {
  id: 'A17-reclamation-plow-after-plow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['plow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    if (isCardFlagged(context.player, CARD_ID)) return
    setCardFlag(context.player, CARD_ID, true)
    writeCardInfobox(context.player, CARD_ID, USED_INFOBOX)
  },
}

export const A17_ReclamationPlow = new MinorImprovement({
  id: CARD_ID,
  name: "Reclamation Plow",
  deck: "A",
  number: 17,
  category: "FARM_PLANNER",
  desc: ["After the next time you take animals from an accumulation space and accommodate all of them on your farm, you can plow 1 field."],
  cost: {"wood":1},
})

export const A17_ReclamationPlow_impl = {
  listeners: [reclamationPlowDuringListener, reclamationPlowAfterListener, reclamationPlowAfterPlowListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
