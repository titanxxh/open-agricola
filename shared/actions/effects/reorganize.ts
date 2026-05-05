import type {
  ActionDefinition,
  ActionExecutionResult,
  GameState,
  PlayerState,
} from '../../game/types'
import { computeAnimalZones } from '../helpers/animal-zones'

export type ReorganizeTrigger =
  | 'anytime'
  | 'returning-home'
  | 'harvest-breed'
  | 'round-end'

export type ZoneAssignment = {
  id: string
  zoneType: 'pasture' | 'house' | 'stable'
  animalType: 'sheep' | 'boar' | 'cattle' | null
  animalCount: number
}

export const applyReorganizeMutate = (
  state: GameState,
  player: PlayerState,
  zones: ZoneAssignment[],
): void => {
  void state
  const totals = zones.reduce(
    (acc, z) => {
      if (z.animalType) acc[z.animalType] += z.animalCount
      return acc
    },
    { sheep: 0, boar: 0, cattle: 0 },
  )

  const computed = computeAnimalZones(player)
  const cap = (id: string) => computed.find((z) => z.id === id)?.capacity ?? 0

  const pastureZones = zones.filter((z) => z.zoneType === 'pasture')
  player.pastures = player.pastures.map((p) => {
    const a = pastureZones.find((z) => z.id === p.id)
    if (!a || !a.animalType) return { ...p, animalType: null, animalCount: 0 }
    const count = Math.max(0, Math.min(cap(p.id), a.animalCount))
    return { ...p, animalType: count > 0 ? a.animalType : null, animalCount: count }
  })

  const houseZone = zones.find((z) => z.zoneType === 'house')
  player.houseAnimalType = houseZone?.animalType ?? null
  player.houseAnimalCount = houseZone?.animalType && houseZone.animalCount > 0 ? 1 : 0

  const stable: Record<string, 'sheep' | 'boar' | 'cattle' | null> = {}
  zones
    .filter((z) => z.zoneType === 'stable')
    .forEach((z) => {
      stable[z.id.replace('stable:', '')] = z.animalType ?? null
    })
  player.stableAnimals = stable

  player.resources.sheep = totals.sheep
  player.resources.boar = totals.boar
  player.resources.cattle = totals.cattle
}

export const reorganizeAction: ActionDefinition = {
  id: 'reorganize',
  nameKey: 'actions.reorganize.name',
  descriptionKey: 'actions.reorganize.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  costPreview: {
    isStructurallyPossible: () => true,
    getBaseCost: () => ({}),
  },
  execute: (ctx): ActionExecutionResult => {
    const trigger = (ctx.actionContext?.trigger as ReorganizeTrigger) ?? 'anytime'
    // NOTE: zones are computed here at emit-time and travel inside `request`.
    // However, GameCore.buildInteraction() in shared/session/session-core.ts still
    // recomputes zones via buildAnimalReorgZones() during the transitional
    // period. Task 6/7 will rewire GameCore to consume zones from the
    // engineStack.peekInteraction()?.request, eliminating the duplicate compute.
    const zones = computeAnimalZones(ctx.player).map((zone) => ({
      id: zone.id,
      zoneType: zone.zoneType as 'pasture' | 'house' | 'stable',
      animalType: (zone.animalType as 'sheep' | 'boar' | 'cattle' | null) ?? null,
      animalCount: zone.animalCount ?? 0,
      capacity: zone.capacity,
    }))
    return {
      type: 'request',
      request: { kind: 'animal-reorg', zones },
      promptKey: 'ui.interactionAnimalReorg',
      promptParams: { trigger },
    }
  },
  resolveChoice: (ctx, choice, payload): ActionExecutionResult => {
    if (choice === 'cancel') return { type: 'ok' }
    const zones = payload as unknown as ZoneAssignment[] | undefined
    if (!zones || !Array.isArray(zones)) return { type: 'fail', logKey: 'log.reorganizeFail' }
    applyReorganizeMutate(ctx.state, ctx.player, zones)
    return { type: 'ok' }
  },
}

