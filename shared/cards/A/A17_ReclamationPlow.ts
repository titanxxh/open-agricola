import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionFlow } from '../../contract/types'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionSpace, PlayerState, Pasture } from '../../contract/types'
import { isCardFlagged, setCardFlag, writeCardInfobox } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { A17_ReclamationPlow } from '../../cards-display/A/A17_ReclamationPlow'

const CARD_ID = A17_ReclamationPlow.id

type AnimalType = 'sheep' | 'boar' | 'cattle'

const USED_INFOBOX = '✓'

const isAnimalAccumulationSpace = (space: ActionSpace): boolean => {
  const gainPerRound = space.gainPerRound ?? {}
  return (gainPerRound.sheep ?? 0) > 0 ||
         (gainPerRound.boar ?? 0) > 0 ||
         (gainPerRound.cattle ?? 0) > 0
}

const getAnimalCountByType = (player: PlayerState): Record<AnimalType, number> => ({
  sheep: (player.houseAnimalType === 'sheep' ? player.houseAnimalCount : 0) +
    Object.values(player.stableAnimals ?? {}).filter((a) => a === 'sheep').length +
    (player.pastures ?? []).reduce((sum: number, p: Pasture) => sum + (p.animalType === 'sheep' ? p.animalCount : 0), 0),
  boar: (player.houseAnimalType === 'boar' ? player.houseAnimalCount : 0) +
    Object.values(player.stableAnimals ?? {}).filter((a) => a === 'boar').length +
    (player.pastures ?? []).reduce((sum: number, p: Pasture) => sum + (p.animalType === 'boar' ? p.animalCount : 0), 0),
  cattle: (player.houseAnimalType === 'cattle' ? player.houseAnimalCount : 0) +
    Object.values(player.stableAnimals ?? {}).filter((a) => a === 'cattle').length +
    (player.pastures ?? []).reduce((sum: number, p: Pasture) => sum + (p.animalType === 'cattle' ? p.animalCount : 0), 0),
})

const buildReclamationPlowUseFlow = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'plow',
  sourceCard: CARD_ID,
  optional: true,
  promptKey: 'ui.interactionReclamationPlow',
  choiceLabelKey: 'ui.interactionReclamationPlowUse',
})

const reclamationPlowAfterCollectListener: CardListenerRegistration = {
  id: 'A17-reclamation-plow-after',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { space, player } = context
    if (!isAnimalAccumulationSpace(space)) return
    if (isCardFlagged(player, CARD_ID)) return

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
    for (const animalType of ['sheep', 'boar', 'cattle'] as AnimalType[]) {
      if (animalsAfterCollecting[animalType] < obtainedAnimals[animalType]) return
    }

    return { flow: buildReclamationPlowUseFlow() }
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

export const A17_ReclamationPlow_impl = {
  listeners: [reclamationPlowAfterCollectListener, reclamationPlowAfterPlowListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
