import { describe, expect, it } from 'vitest'
import { executeCardListener, getRegisteredCardListeners } from '../card-listeners'
import type { ActionSpace, GameState, PlayerState } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'

import '../A/A065_SeedPellets'
import '../A/A126_MasterWorkman'
import '../B/B067_HandTruck'
import '../B/B075_WoodWorkshop'
import '../B/B094_StockProtector'
import '../C/C112_Thresher'
import '../D/D014_HammerCrusher'
import '../D/D017_DrillHarrow'
import '../D/D049_Bookshelf'
import '../D/D066_PotterCeramics'
import '../D/D119_WoodBarterer'
import '../D/D152_Patron'
import '../E/E074_AshTrees'
import '../__stubs__/STUB_BeforeBakeGainClay'

const resources = () => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
})

const player = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: resources(),
  workers: [{ id: 'w1', isActive: true, isNewborn: false }],
  rooms: 2,
  houseType: 'clay',
  fields: [],
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [
    'A065_SeedPellets',
    'B075_WoodWorkshop',
    'D017_DrillHarrow',
    'D066_PotterCeramics',
    'D119_WoodBarterer',
    'STUB_BeforeBakeGainClay',
  ],
  occupationHand: [],
  occupationPlayed: [
    'A126_MasterWorkman',
    'B067_HandTruck',
    'B094_StockProtector',
    'C112_Thresher',
    'D014_HammerCrusher',
    'D049_Bookshelf',
    'D152_Patron',
    'E074_AshTrees',
  ],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  cardStates: {
    E074_AshTrees: { counters: { fences: 4 } },
  },
}) as PlayerState

const state = (p: PlayerState): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [p],
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: ['fencing', 'grain-utilization', 'bake-bread', 'major-improvement'],
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  workPhaseObtainedResources: {},
}) as GameState

const space = (id: string): ActionSpace => ({
  id,
  nameKey: `actions.${id}.name`,
  descriptionKey: `actions.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => false,
  execute: () => ({ type: 'ok' }),
  resources: resources(),
  takenBy: [],
}) as ActionSpace

const findListener = (id: string) => {
  const listener = getRegisteredCardListeners().find((entry) => entry.id === id)
  if (!listener) throw new Error(`missing listener ${id}`)
  return listener
}

const cases = [
  ['A65-seed-pellets-isdoable-sow', 'sow'],
  ['A126-master-workman-isdoable', 'fencing'],
  ['B67-hand-truck-isdoable-bake', 'bake-bread'],
  ['B75-wood-workshop-isdoable-improvement', 'improvement'],
  ['B94-stock-protector-isdoable-fencing', 'fence'],
  ['C112-thresher-isdoable-sow', 'sow'],
  ['D14-hammer-crusher-isdoable-renovate', 'renovate-house'],
  ['D17-drill-harrow-isdoable-sow', 'sow'],
  ['D49-bookshelf-isdoable-occupation', 'occupation'],
  ['D66-potter-ceramics-isdoable-bake', 'bake-bread'],
  ['D119-wood-barterer-isdoable', 'fence'],
  ['D152-patron-isdoable-occupation', 'occupation'],
  ['E74-ash-trees-isdoable-fence', 'fence'],
  ['STUB-before-bake-gain-clay-isdoable', 'bake-bread'],
] as const

describe('before-reachability opt-in guards', () => {
  it.each(cases)('%s does not re-open skipBeforeTriggers continuation', (listenerId, actionId) => {
    const p = player()
    const result = executeCardListener(findListener(listenerId), {
      state: state(p),
      player: p,
      space: space(actionId),
      actionId,
      phase: 'isDoable',
      doable: false,
      trueAction: true,
      actionContext: { skipBeforeTriggers: true },
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
