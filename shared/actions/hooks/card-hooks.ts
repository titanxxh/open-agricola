import { registerActionHook } from '../hooks'
import { gainResources } from '../effects/gain'
import { getRenovation } from '../effects/house'
import { applyCostOverride, canPayResources } from '../effects/pay'
import { trackWorkPhaseBuildingResources } from '../../logic/state'

const BUILDING_RESOURCES_ACTION = ['gain', 'receive', 'collect', 'exchange'] as const

const hasMinor = (ids: string[], id: string) => ids.includes(id)
const hasOccupation = (ids: string[], id: string) => ids.includes(id)

export const registerCardHooks = () => {
  registerActionHook({
    id: 'track-building-resources',
    actions: [...BUILDING_RESOURCES_ACTION],
    phases: ['immediatelyAfter'],
    handler: ({ state, player, result }) => {
      if (result?.type !== 'ok') return
      if (!result.resourcesGained) return
      // Only track for players who have A53_Claypipe
      if (!player.minorPlayed.includes('A53_Claypipe')) return
      trackWorkPhaseBuildingResources(state, player.id, result.resourcesGained)
    },
  })

  registerActionHook({
    id: 'minor-ash-trees',
    actions: ['fencing'],
    phases: ['before'],
    handler: ({ player }) => {
      if (!hasMinor(player.minorPlayed, 'E74_AshTrees')) return
      gainResources(player, { wood: 1 })
    },
  })

  registerActionHook({
    id: 'minor-wood-workshop-cost',
    actions: ['farm-redevelopment', 'house-redevelopment'],
    phases: ['computeCosts'],
    handler: ({ player }) => {
      if (!hasMinor(player.minorPlayed, 'B75_WoodWorkshop')) return
      return { costs: { reed: -1 } }
    },
  })

  registerActionHook({
    id: 'minor-wood-workshop-doable',
    actions: ['farm-redevelopment', 'house-redevelopment'],
    phases: ['isDoable'],
    handler: ({ player }) => {
      if (!hasMinor(player.minorPlayed, 'B75_WoodWorkshop')) return
      const renovation = getRenovation(player)
      if (!renovation) return { doable: false }
      const cost = applyCostOverride(renovation.cost, { reed: -1 })
      return { doable: canPayResources(player, cost) }
    },
  })

  registerActionHook({
    id: 'minor-shepherds-crook',
    actions: ['fencing'],
    phases: ['immediatelyAfter'],
    handler: ({ player, result }) => {
      if (result?.type !== 'ok') return
      if (!hasMinor(player.minorPlayed, 'A83_ShepherdsCrook')) return
      gainResources(player, { sheep: 1 })
    },
  })

  registerActionHook({
    id: 'minor-seed-pellets',
    actions: ['cultivation'],
    phases: ['before'],
    handler: ({ player }) => {
      if (!hasMinor(player.minorPlayed, 'A65_SeedPellets')) return
      gainResources(player, { grain: 1 })
    },
  })

  registerActionHook({
    id: 'minor-boar-spear',
    actions: ['pig-market'],
    phases: ['during'],
    handler: ({ player }) => {
      if (!hasMinor(player.minorPlayed, 'E53_BoarSpear')) return
      gainResources(player, { boar: 1 })
    },
  })

  registerActionHook({
    id: 'occupation-overachiever',
    actions: ['wish-children'],
    phases: ['isDoable'],
    handler: ({ player }) => {
      if (!hasOccupation(player.occupationPlayed, 'E130_Overachiever')) return
      return { doable: true }
    },
  })

  registerActionHook({
    id: 'occupation-field-merchant',
    actions: ['day-laborer'],
    phases: ['computeReplace'],
    handler: ({ player }) => {
      if (!hasOccupation(player.occupationPlayed, 'B103_FieldMerchant')) return
      return { actionId: 'grain-seeds' }
    },
  })

  registerActionHook({
    id: 'occupation-master-workman',
    actions: ['cultivation'],
    phases: ['computeArgs'],
    handler: ({ player }) => {
      if (!hasOccupation(player.occupationPlayed, 'A126_MasterWorkman')) return
      return {
        extraOptions: [
          { value: 'plow-bonus', labelKey: 'ui.interactionCultivationPlowBonus' },
        ],
      }
    },
  })

  registerActionHook({
    id: 'minor-barrow-pusher',
    actions: ['farmland'],
    phases: ['after'],
    handler: ({ player, result }) => {
      if (result?.type !== 'ok') return
      if (!hasMinor(player.minorPlayed, 'A105_BarrowPusher')) return
      return { followUpActions: ['bonus-food'] }
    },
  })
}
