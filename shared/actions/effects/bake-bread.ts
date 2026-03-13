import type {
  ActionChoiceOption,
  ActionDefinition,
  ActionExecutionResult,
  PlayerState,
} from '../../game/types'

const bakeTable = {
  Major_Fireplace1: 2,
  Major_Fireplace2: 2,
  Major_CookingHearth1: 3,
  Major_CookingHearth2: 3,
  Major_ClayOven: 5,
  Major_StoneOven: 4,
} as const

export type BakeImprovementId = keyof typeof bakeTable

export const canBakeBread = (player: PlayerState, improvement: BakeImprovementId) =>
  player.resources.grain > 0 && player.improvements.includes(improvement)

export const bakeBread = (
  player: PlayerState,
  improvement: BakeImprovementId,
  times = 1,
): ActionExecutionResult => {
  if (!canBakeBread(player, improvement)) {
    return { type: 'ok' }
  }
  const bakeTimes = Math.max(0, Math.min(player.resources.grain, times))
  if (bakeTimes === 0) {
    return { type: 'ok' }
  }
  const foodGained = bakeTable[improvement] * bakeTimes
  player.resources.grain -= bakeTimes
  player.resources.food += foodGained
  return {
    type: 'ok',
    logKey: 'log.bakeBreadResult',
    logParams: {
      grainUsed: bakeTimes,
      foodGained,
      improvement,
    },
  }
}

const bakeImprovements: BakeImprovementId[] = [
  'Major_Fireplace1',
  'Major_Fireplace2',
  'Major_CookingHearth1',
  'Major_CookingHearth2',
  'Major_ClayOven',
  'Major_StoneOven',
]

const bakeLabelKey: Record<BakeImprovementId, string> = {
  Major_Fireplace1: 'ui.interactionBakeBreadFireplace',
  Major_Fireplace2: 'ui.interactionBakeBreadFireplace',
  Major_CookingHearth1: 'ui.interactionBakeBreadCookingHearth',
  Major_CookingHearth2: 'ui.interactionBakeBreadCookingHearth',
  Major_ClayOven: 'ui.interactionBakeBreadClayOven',
  Major_StoneOven: 'ui.interactionBakeBreadStoneOven',
}

const bakeMaxUses: Record<BakeImprovementId, number> = {
  Major_Fireplace1: Number.POSITIVE_INFINITY,
  Major_Fireplace2: Number.POSITIVE_INFINITY,
  Major_CookingHearth1: Number.POSITIVE_INFINITY,
  Major_CookingHearth2: Number.POSITIVE_INFINITY,
  Major_ClayOven: 1,
  Major_StoneOven: 2,
}

const buildBakeBreadOptions = (player: PlayerState): ActionChoiceOption[] => {
  const options: ActionChoiceOption[] = bakeImprovements
    .filter((id) => canBakeBread(player, id))
    .map((id) => ({ value: id, labelKey: bakeLabelKey[id] }))
  options.push({ value: 'cancel', labelKey: 'ui.interactionCancel' })
  return options
}

const resolveBakeBreadChoice = (
  player: PlayerState,
  choice: string,
): ActionExecutionResult => {
  if (choice === 'cancel') {
    return { type: 'ok' }
  }
  if (choice.startsWith('bulk:')) {
    const payload = choice.replace('bulk:', '').trim()
    if (!payload) return { type: 'ok' }
    payload.split(',').forEach((entry) => {
      const [improvementId, countText] = entry.split('=')
      if (!bakeImprovements.includes(improvementId as BakeImprovementId)) {
        return
      }
      const count = Number(countText)
      if (!Number.isFinite(count) || count <= 0) return
      const maxUse = bakeMaxUses[improvementId as BakeImprovementId]
      const allowed = Math.min(count, maxUse)
      if (allowed <= 0) return
      bakeBread(player, improvementId as BakeImprovementId, allowed)
    })
    return { type: 'ok' }
  }
  if (choice.startsWith('count-')) {
    const [, improvementId, countText] = choice.split('-')
    if (bakeImprovements.includes(improvementId as BakeImprovementId)) {
      const count = Number(countText)
      return bakeBread(player, improvementId as BakeImprovementId, count)
    }
    return { type: 'ok' }
  }
  if (bakeImprovements.includes(choice as BakeImprovementId)) {
    const improvement = choice as BakeImprovementId
    const grain = player.resources.grain
    const maxUse = bakeMaxUses[improvement]
    const maxCount = Math.max(0, Math.min(grain, maxUse))
    if (maxCount <= 1) {
      return bakeBread(player, improvement, maxCount)
    }
    return {
      type: 'choice',
      promptKey: 'ui.interactionBakeBreadCount',
      options: Array.from({ length: maxCount }, (_, index) => ({
        value: `count-${improvement}-${index + 1}`,
        labelKey: 'ui.interactionBakeBreadCountLabel',
        labelParams: { count: index + 1 },
      })),
    }
  }
  return { type: 'ok' }
}

export const bakeBreadAction: ActionDefinition = {
  id: 'bake-bread',
  nameKey: 'actions.bake-bread.name',
  descriptionKey: 'actions.bake-bread.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) =>
    bakeImprovements.some((id) => canBakeBread(player, id)),
  execute: ({ player }) => ({
    type: 'choice',
    promptKey: 'ui.interactionBakeBreadChoice',
    options: buildBakeBreadOptions(player),
  }),
  resolveChoice: ({ player }, choice) => resolveBakeBreadChoice(player, choice),
}