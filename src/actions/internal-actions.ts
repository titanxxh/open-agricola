import type { ActionChoiceOption, ActionDefinition } from '../game/types'
import { bakeBread, canBakeBread, type BakeImprovementId } from './effects/bake-bread'
import { gainResources } from './effects/gain'
import { canAfford, getBuildRoomCost } from './effects/house'
import { canPayResources } from './effects/pay'
import { stableWoodCost } from './effects/fencing'
import { getPlowableTiles } from './effects/plow'
import { canSow } from './effects/sow'
import { growFamily } from './effects/family-growth'
import { getMinorImprovement } from '../game/minor-improvements'
import { getMinorImprovementCost, playImprovement } from './effects/improvement'
import type { PlayerState } from '../game/types'

const createBonusAction = (
  id: string,
  gain: { wood?: number; food?: number; grain?: number },
): ActionDefinition => ({
  id,
  nameKey: `actions.${id}.name`,
  descriptionKey: `actions.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    gainResources(player, gain)
    return { type: 'ok' }
  },
})

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

const buildPlayableMinorOptions = (player: PlayerState): ActionChoiceOption[] =>
  player.minorHand
    .map((id) => getMinorImprovement(id))
    .filter(
      (improvement): improvement is NonNullable<typeof improvement> =>
        !!improvement,
    )
    .filter((improvement) => {
      const cost = getMinorImprovementCost(player, improvement.id) ?? improvement.cost
      return canPayResources(player, cost)
    })
    .map((improvement) => ({
      value: improvement.id,
      labelKey: `minorImprovements.${improvement.id}.name`,
    }))

export const internalActionDefinitions: ActionDefinition[] = [
  createBonusAction('bonus-wood', { wood: 1 }),
  createBonusAction('bonus-food', { food: 1 }),
  createBonusAction('bonus-grain', { grain: 1 }),
  {
    id: 'wish-children-growth',
    nameKey: 'actions.wish-children-growth.name',
    descriptionKey: 'actions.wish-children-growth.description',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: (_, player) => player.rooms > player.familySize,
    execute: ({ player }) => growFamily(player),
  },
  {
    id: 'minor-improvement',
    nameKey: 'actions.minor-improvement.name',
    descriptionKey: 'actions.minor-improvement.description',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: (_, player) =>
      buildPlayableMinorOptions(player).length > 0,
    execute: ({ player }) => {
      const options = buildPlayableMinorOptions(player)
      if (options.length === 0) {
        return { type: 'ok' }
      }
      return {
        type: 'choice',
        promptKey: 'ui.interactionChooseMinorImprovement',
        options,
      }
    },
    resolveChoice: ({ state, player }, choice) =>
      playImprovement(state, player, choice, 'minor'),
  },
  {
    id: 'stables',
    nameKey: 'actions.stables.name',
    descriptionKey: 'actions.stables.description',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: (_, player) =>
      player.stableTiles.length < 4 &&
      canPayResources(player, { wood: stableWoodCost }),
    execute: () => ({
      type: 'choice',
      promptKey: 'ui.interactionStableSelect',
      options: [
        { value: 'confirm', labelKey: 'ui.interactionStableConfirm' },
        { value: 'cancel', labelKey: 'ui.interactionStableCancel' },
      ],
    }),
    resolveChoice: () => ({ type: 'ok' }),
  },
  {
    id: 'plow',
    nameKey: 'actions.plow.name',
    descriptionKey: 'actions.plow.description',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: (_, player) => getPlowableTiles(player).length > 0,
    execute: () => ({
      type: 'choice',
      promptKey: 'ui.interactionPlowSelect',
      options: [
        { value: 'confirm', labelKey: 'ui.interactionPlowConfirm' },
        { value: 'cancel', labelKey: 'ui.interactionPlowCancel' },
      ],
    }),
    resolveChoice: () => ({ type: 'ok' }),
  },
  {
    id: 'sow',
    nameKey: 'actions.sow.name',
    descriptionKey: 'actions.sow.description',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: (_, player) => canSow(player),
    execute: () => ({
      type: 'choice',
      promptKey: 'ui.interactionSowSelect',
      options: [
        { value: 'confirm', labelKey: 'ui.interactionSowConfirm' },
        { value: 'cancel', labelKey: 'ui.interactionSowCancel' },
      ],
    }),
    resolveChoice: () => ({ type: 'ok' }),
  },
  {
    id: 'bake-bread',
    nameKey: 'actions.bake-bread.name',
    descriptionKey: 'actions.bake-bread.description',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: (_, player) =>
      bakeImprovements.some((id) => canBakeBread(player, id)),
    execute: ({ player }) => {
      const options: ActionChoiceOption[] = bakeImprovements
        .filter((id) => canBakeBread(player, id))
        .map((id) => ({ value: id, labelKey: bakeLabelKey[id] }))
      options.push({ value: 'cancel', labelKey: 'ui.interactionCancel' })
      return {
        type: 'choice',
        promptKey: 'ui.interactionBakeBreadChoice',
        options,
      }
    },
    resolveChoice: ({ player }, choice) => {
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
    },
  },
  {
    id: 'construct',
    nameKey: 'actions.construct.name',
    descriptionKey: 'actions.construct.description',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: (_, player) =>
      canAfford(player, getBuildRoomCost(player.houseType)),
    execute: () => ({
      type: 'choice',
      promptKey: 'ui.interactionRoomSelect',
      options: [
        { value: 'confirm', labelKey: 'ui.interactionRoomConfirm' },
        { value: 'cancel', labelKey: 'ui.interactionRoomCancel' },
      ],
    }),
    resolveChoice: () => ({ type: 'ok' }),
  },
]
