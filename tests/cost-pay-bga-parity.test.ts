import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import type {
  ActionSpace,
  Bonus,
  ComplexCost,
  CostModifierType,
  GameState,
  PaymentResourceMap,
  PaymentSolution,
  PlayerState,
  Resource,
  Trade,
} from '../shared/contract/types'
import {
  buildConstructCost,
  computeAllBuyableCombinations,
  isComplexCost,
  resolveCardCostWithModifiersDetailed,
} from '../shared/actions/payment/internal'
import { buildRenovationPlan } from '../shared/actions/effects/renovation'
import { getActiveCardRegistry } from '../shared/cards/active-registry'
import { getCardModifiers } from '../shared/cards/card-modifiers'
import { runCardListeners } from '../shared/cards/card-listeners'
import '../shared/cards/__tests__/setup-register-all'

type BgaCost = {
  fees?: Array<Record<string, unknown>>
  trades?: Array<Record<string, unknown>>
  bonuses?: Array<Record<string, unknown>>
}

type PaymentOption = {
  resources: Record<string, number>
  sources: string[]
  /** Expanded from a multi-choice bonus — exempt from dominance pruning. */
  fromChoices?: boolean
}

type DiffKind = 'payment-diff' | 'source-diff'

type ScenarioDiff = {
  name: string
  kind: Scenario['kind']
  scenario: Scenario
  diffKind: DiffKind
  bga: PaymentOption[]
  oa: PaymentOption[]
}

type PlayedZone = 'occupationPlayed' | 'minorPlayed' | 'improvements'

type PlayedCard = {
  id: string
  zone: PlayedZone
}

type ScenarioBase = {
  name: string
  cards: PlayedCard[]
  rooms?: number
  houseType?: PlayerState['houseType']
  round?: number
  units?: number
  sourceCard?: string
  actionCardId?: string
  spaceId?: string
  params?: Record<string, unknown>
  flaggedCards?: string[]
  pendingFenceBonus?: {
    sourceCard: string
    freeFences: number
  }
}

type CardPurchaseScenario = ScenarioBase & {
  kind: 'card-purchase'
  targetId: string
  baseCost: PaymentResourceMap | ComplexCost
}

type ActionScenario = ScenarioBase & {
  kind: 'construct' | 'renovation' | 'fencing' | 'stables'
  targetHouseType?: 'clay' | 'stone'
}

type Scenario = CardPurchaseScenario | ActionScenario

type ActionAdjustments = {
  costs: Partial<Resource>
  bonuses: Bonus[]
  trades: Trade[]
}

const RESOURCE_KEYS = [
  'wood',
  'clay',
  'reed',
  'stone',
  'food',
  'grain',
  'vegetable',
  'sheep',
  'pig',
  'boar',
  'cattle',
  'begging',
  'fence',
  'stable',
] as const

const BGA_HARNESS = path.resolve(
  process.cwd(),
  '../../../bga-agricola/.worktree/bga-cost-pay-ut/tests/bga-cost-pay-parity.php',
)

const BGA_FIXTURE = path.resolve(process.cwd(), 'tests/__fixtures__/cost-pay-bga-parity.json')

const REPORT_PATH = path.resolve(process.cwd(), 'docs/cost-pay-bga-parity-report.md')

const baseResources = {
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
}

const richResources = {
  wood: 20,
  clay: 20,
  reed: 20,
  stone: 20,
  food: 20,
  grain: 20,
  vegetable: 20,
  sheep: 20,
  boar: 20,
  cattle: 20,
  begging: 0,
}

const minorCards = new Set([
  'A16_RammedClay',
  'A27_OvenSite',
  'A75_LumberMill',
  'A14_CarpentersHammer',
  'B13_CarpentersParlor',
  'B15_CarpentersBench',
  'C14_StrawThatchedRoof',
  'C27_Blueprint',
  'C56_FeedFence',
  'C128_WoodenHutExtender',
  'C13_WoodSlideHammer',
  'D13_Trowel',
  'D15_ClaySupports',
  'D81_RoofLadder',
  'D82_HuntingTrophy',
  'E27_PiggyBank',
])

const play = (id: string): PlayedCard => ({
  id,
  zone: minorCards.has(id) ? 'minorPlayed' : 'occupationPlayed',
})

const createPlayer = (resources: typeof baseResources = baseResources): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: { ...resources },
  workers: [],
  rooms: 3,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
} as unknown as PlayerState)

const createState = (player: PlayerState, round = 5): GameState => ({
  round,
  currentPlayerIndex: 0,
  players: [player],
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: [],
  gameSeed: 1,
  availableMajorImprovements: ['Major_Basket', 'Major_Joinery', 'Major_ClayOven'],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  workPhaseObtainedResources: {},
} as unknown as GameState)

const createSpace = (id: string): ActionSpace => ({
  id,
  nameKey: `actions.${id}.name`,
  descriptionKey: `actions.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  resources: { ...baseResources },
  takenBy: [],
} as unknown as ActionSpace)

const fullBase = { fees: [{ wood: 2, clay: 2, reed: 2, stone: 2 }] }

const cardPurchaseScenarios: CardPurchaseScenario[] = [
  { name: 'A143 card-purchase stone discount', kind: 'card-purchase', targetId: 'Major_Joinery', cards: [play('A143_Stonecutter')], baseCost: fullBase },
  { name: 'A27 oven fixed cost', kind: 'card-purchase', targetId: 'Major_ClayOven', cards: [play('A27_OvenSite')], actionCardId: 'A27_OvenSite', baseCost: { fees: [{ clay: 3, stone: 1 }] }, flaggedCards: ['A27_OvenSite'] },
  { name: 'A75 card-purchase wood bonus', kind: 'card-purchase', targetId: 'Major_Joinery', cards: [play('A75_LumberMill')], baseCost: fullBase },
  { name: 'B95 major stone discount by rooms', kind: 'card-purchase', targetId: 'Major_Joinery', cards: [play('B95_MasterBricklayer')], baseCost: fullBase, rooms: 4 },
  { name: 'C122 card-purchase clay discount', kind: 'card-purchase', targetId: 'Major_Joinery', cards: [play('C122_Bricklayer')], baseCost: fullBase },
  { name: 'C27 blueprint major discount', kind: 'card-purchase', targetId: 'Major_Basket', cards: [play('C27_Blueprint')], baseCost: fullBase },
  { name: 'C95 basket fixed cost', kind: 'card-purchase', targetId: 'Major_Basket', cards: [play('C95_BasketWeaver')], actionCardId: 'C95_BasketWeaver', baseCost: { fees: [{ reed: 2, stone: 2 }] }, flaggedCards: ['C95_BasketWeaver'] },
  { name: 'D117 wood for food candidates', kind: 'card-purchase', targetId: 'Major_Joinery', cards: [play('D117_WoodExpert')], baseCost: fullBase },
  { name: 'D82 house redevelopment improvement discount choice', kind: 'card-purchase', targetId: 'Major_Joinery', cards: [play('D82_HuntingTrophy')], baseCost: fullBase, spaceId: 'house-redevelopment' },
  { name: 'D95 site manager replacement candidates', kind: 'card-purchase', targetId: 'Major_Joinery', cards: [play('D95_SiteManager')], actionCardId: 'D95_SiteManager', baseCost: fullBase, flaggedCards: ['D95_SiteManager'] },
  { name: 'D96 furnisher wood discount', kind: 'card-purchase', targetId: 'Major_Joinery', cards: [play('D96_Furnisher')], actionCardId: 'D96_Furnisher', baseCost: fullBase },
  { name: 'E109 basket fixed cost', kind: 'card-purchase', targetId: 'Major_Basket', cards: [play('E109_BraidMaker')], baseCost: { fees: [{ reed: 2, stone: 2 }] } },
  { name: 'E123 card-purchase top resource choices', kind: 'card-purchase', targetId: 'Major_Joinery', cards: [play('E123_ResourceHoarder')], baseCost: fullBase },
  { name: 'E130 overachiever resource choice discount', kind: 'card-purchase', targetId: 'Major_Joinery', cards: [play('E130_Overachiever')], actionCardId: 'E130_Overachiever', baseCost: fullBase },
  { name: 'E27 piggy bank free major candidate', kind: 'card-purchase', targetId: 'Major_Joinery', cards: [play('E27_PiggyBank')], baseCost: fullBase, flaggedCards: ['E27_PiggyBank'] },
  { name: 'combo card-purchase basket fixed price plus stone and wood modifiers', kind: 'card-purchase', targetId: 'Major_Basket', cards: [play('C95_BasketWeaver'), play('E109_BraidMaker'), play('A143_Stonecutter'), play('D117_WoodExpert')], actionCardId: 'C95_BasketWeaver', baseCost: { fees: [{ wood: 2, reed: 2, stone: 2 }] }, flaggedCards: ['C95_BasketWeaver'] },
]

const actionScenarios: ActionScenario[] = [
  { name: 'A123 construct frame replacement', kind: 'construct', cards: [play('A123_FrameBuilder')], houseType: 'clay' },
  { name: 'A128 riparian construct discount', kind: 'construct', cards: [play('A128_RiparianBuilder')], houseType: 'clay', sourceCard: 'A128_RiparianBuilder' },
  { name: 'A149 house artist reed discount', kind: 'construct', cards: [play('A149_HouseArtist')], houseType: 'wood', sourceCard: 'A149_HouseArtist' },
  { name: 'A14 carpenter hammer construct bonuses', kind: 'construct', cards: [play('A14_CarpentersHammer')], houseType: 'wood', units: 2 },
  { name: 'A143 construct stone discount', kind: 'construct', cards: [play('A143_Stonecutter')], houseType: 'stone' },
  { name: 'B126 carpenter fixed room cost', kind: 'construct', cards: [play('B126_Carpenter')], houseType: 'wood' },
  { name: 'B13 carpenter parlor fixed wood room cost', kind: 'construct', cards: [play('B13_CarpentersParlor')], houseType: 'wood' },
  { name: 'B145 brushwood construct reed replacement', kind: 'construct', cards: [play('B145_BrushwoodCollector')], houseType: 'wood' },
  { name: 'C122 construct clay discount', kind: 'construct', cards: [play('C122_Bricklayer')], houseType: 'clay' },
  { name: 'C128 wooden hut extender round cost', kind: 'construct', cards: [play('C128_WoodenHutExtender')], houseType: 'wood', round: 8 },
  { name: 'C14 straw roof removes construct reed', kind: 'construct', cards: [play('C14_StrawThatchedRoof')], houseType: 'wood' },
  { name: 'C88 apprentice wood room discount', kind: 'construct', cards: [play('C88_CarpentersApprentice')], houseType: 'wood' },
  { name: 'D121 clay plasterer fixed clay room cost', kind: 'construct', cards: [play('D121_ClayPlasterer')], houseType: 'clay' },
  { name: 'D15 clay supports alternative clay room cost', kind: 'construct', cards: [play('D15_ClaySupports')], houseType: 'clay' },
  { name: 'D88 millwright construct bonuses', kind: 'construct', cards: [play('D88_Millwright')], houseType: 'wood' },
  { name: 'E123 construct top resource choices', kind: 'construct', cards: [play('E123_ResourceHoarder')], houseType: 'clay' },
  { name: 'E150 rock beater stone room discount', kind: 'construct', cards: [play('E150_RockBeater')], houseType: 'stone' },
  { name: 'A123 renovation frame replacement', kind: 'renovation', cards: [play('A123_FrameBuilder')], houseType: 'wood', targetHouseType: 'stone', rooms: 3 },
  { name: 'A143 renovation stone discount', kind: 'renovation', cards: [play('A143_Stonecutter')], houseType: 'wood', targetHouseType: 'stone', rooms: 3 },
  { name: 'B128 plumber renovation choices', kind: 'renovation', cards: [play('B128_Plumber')], houseType: 'wood', targetHouseType: 'stone', sourceCard: 'B128_Plumber', rooms: 3 },
  { name: 'B145 brushwood renovation reed replacement', kind: 'renovation', cards: [play('B145_BrushwoodCollector')], houseType: 'wood', targetHouseType: 'clay', rooms: 3 },
  { name: 'C122 renovation clay discount', kind: 'renovation', cards: [play('C122_Bricklayer')], houseType: 'wood', targetHouseType: 'clay', rooms: 3 },
  { name: 'C13 wood slide hammer stone discount', kind: 'renovation', cards: [play('C13_WoodSlideHammer')], houseType: 'wood', targetHouseType: 'stone', rooms: 5 },
  { name: 'C14 straw roof removes renovation reed', kind: 'renovation', cards: [play('C14_StrawThatchedRoof')], houseType: 'wood', targetHouseType: 'clay', rooms: 3 },
  { name: 'D121 clay plasterer fixed clay renovation', kind: 'renovation', cards: [play('D121_ClayPlasterer')], houseType: 'wood', targetHouseType: 'clay', rooms: 3 },
  { name: 'D13 trowel wood to stone fixed cost', kind: 'renovation', cards: [play('D13_Trowel')], houseType: 'wood', targetHouseType: 'stone', sourceCard: 'D13_Trowel', params: { selectedOption: 'stone' }, rooms: 3 },
  { name: 'D154 chimney sweep stone discount', kind: 'renovation', cards: [play('D154_ChimneySweep')], houseType: 'wood', targetHouseType: 'stone', rooms: 3 },
  { name: 'D81 roof ladder reed discount', kind: 'renovation', cards: [play('D81_RoofLadder')], houseType: 'wood', targetHouseType: 'clay', rooms: 3 },
  { name: 'D88 millwright renovation bonuses', kind: 'renovation', cards: [play('D88_Millwright')], houseType: 'wood', targetHouseType: 'stone', rooms: 3 },
  { name: 'E123 renovation top resource choices', kind: 'renovation', cards: [play('E123_ResourceHoarder')], houseType: 'wood', targetHouseType: 'stone', rooms: 3 },
  { name: 'E87 master renovator flagged choices', kind: 'renovation', cards: [play('E87_MasterRenovator')], houseType: 'wood', targetHouseType: 'stone', rooms: 3, round: 7 },
  { name: 'A16 rammed clay fence trade', kind: 'fencing', cards: [play('A16_RammedClay')] },
  { name: 'A88 hedge keeper free fences', kind: 'fencing', cards: [play('A88_HedgeKeeper')] },
  { name: 'B15 carpenters bench constrained free fence', kind: 'fencing', cards: [play('B15_CarpentersBench')], pendingFenceBonus: { sourceCard: 'B15_CarpentersBench', freeFences: 1 } },
  { name: 'D82 farm redevelopment fence discount', kind: 'fencing', cards: [play('D82_HuntingTrophy')], spaceId: 'farm-redevelopment' },
  { name: 'D88 millwright fence bonuses', kind: 'fencing', cards: [play('D88_Millwright')] },
  { name: 'C56 feed fence stable clay alternative', kind: 'stables', cards: [play('C56_FeedFence')] },
  { name: 'D88 millwright stable bonuses', kind: 'stables', cards: [play('D88_Millwright')] },
  { name: 'combo construct clay room replacement plus grain substitution', kind: 'construct', cards: [play('D121_ClayPlasterer'), play('A123_FrameBuilder'), play('D88_Millwright')], houseType: 'clay' },
  { name: 'combo renovation trowel brushwood and millwright', kind: 'renovation', cards: [play('D13_Trowel'), play('B145_BrushwoodCollector'), play('D88_Millwright')], houseType: 'wood', targetHouseType: 'stone', sourceCard: 'D13_Trowel', params: { selectedOption: 'stone' }, rooms: 2 },
  { name: 'combo fencing clay/free/grain alternatives', kind: 'fencing', cards: [play('A16_RammedClay'), play('A88_HedgeKeeper'), play('D88_Millwright')] },
  { name: 'combo stables clay alternative plus grain substitution', kind: 'stables', cards: [play('C56_FeedFence'), play('D88_Millwright')] },
]

const scenarios: Scenario[] = [...cardPurchaseScenarios, ...actionScenarios]

const ACCEPTED_DIFF_REASONS: Record<string, string> = {
  'E123 card-purchase top resource choices': 'Accepted: E123 top-k payment choices are stateful because after-pay consumes the selected count from the card stack; OA keeps the full stateful choice set instead of pruning by resources only.',
  'combo card-purchase basket fixed price plus stone and wood modifiers': 'Accepted: the payable resources are equivalent; OA collapses equivalent fixed-price source-attribution rows that have no distinct payment consequence.',
  'E123 construct top resource choices': 'Accepted: E123 use-top-k is stateful, so the no-use and use-resource paths may lead to different future card stack state even when one pays more resources.',
  'E123 renovation top resource choices': 'Accepted: BGA records a k=0 Resource Hoarder choice source for the no-use branch; OA treats k=0 as no card effect and omits the source.',
}

type BgaPayload = {
  singleCardCaseCount: number
  comboCaseCount: number
  results: Record<string, BgaCost>
  coveredCardIds: string[]
}

const getBgaPayload = () => {
  if (existsSync(BGA_HARNESS)) {
    const result = spawnSync('php', [BGA_HARNESS, '--json'], { encoding: 'utf8' })
    expect(result.status, result.stderr || result.stdout).toBe(0)
    return JSON.parse(result.stdout) as BgaPayload
  }
  expect(existsSync(BGA_FIXTURE), `missing BGA harness: ${BGA_HARNESS}; missing fixture: ${BGA_FIXTURE}`).toBe(true)
  return JSON.parse(readFileSync(BGA_FIXTURE, 'utf8')) as BgaPayload
}

const stripResources = (raw: Record<string, unknown>, multiplier = 1): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const key of RESOURCE_KEYS) {
    const value = raw[key]
    if (typeof value === 'number' && value > 0) out[key] = value * multiplier
  }
  return out
}

const normalizeSources = (sources: unknown): string[] =>
  Array.isArray(sources) ? [...new Set(sources.filter((value): value is string => typeof value === 'string'))].sort() : []

const normalizeResources = (resources: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = {}
  const known = new Set<string>(RESOURCE_KEYS)
  for (const key of RESOURCE_KEYS) {
    const value = resources[key]
    if (typeof value === 'number' && value > 0) out[key] = value
  }
  for (const key of Object.keys(resources).filter((value) => !known.has(value)).sort()) {
    const value = resources[key]
    if (typeof value === 'number' && value > 0) out[key] = value
  }
  return out
}

const canonicalOption = (option: PaymentOption): PaymentOption => ({
  resources: normalizeResources(option.resources),
  sources: normalizeSources(option.sources),
})

const optionKey = (option: PaymentOption): string =>
  JSON.stringify(canonicalOption(option))

const uniqueSortedOptions = (options: PaymentOption[]) =>
  [...new Map(options.map((option) => {
    const canonical = canonicalOption(option)
    return [optionKey(canonical), canonical]
  })).values()]
    .sort((left, right) => optionKey(left).localeCompare(optionKey(right)))

const optionListKey = (options: PaymentOption[]): string =>
  JSON.stringify(uniqueSortedOptions(options))

const paymentShapeKey = (options: PaymentOption[]): string =>
  JSON.stringify(uniqueSortedOptions(options).map((option) => option.resources))

const compareOptions = (
  scenario: Scenario,
  bga: PaymentOption[],
  oa: PaymentOption[],
): ScenarioDiff[] => {
  const expected = uniqueSortedOptions(bga)
  const actual = uniqueSortedOptions(oa)
  if (optionListKey(expected) === optionListKey(actual)) return []
  return [{
    name: scenario.name,
    kind: scenario.kind,
    scenario,
    diffKind: paymentShapeKey(expected) === paymentShapeKey(actual) ? 'source-diff' : 'payment-diff',
    bga: expected,
    oa: actual,
  }]
}

const addCost = (base: PaymentOption, raw: Record<string, unknown>, multiplier = 1): PaymentOption | null => {
  const resources = { ...base.resources }
  for (const key of RESOURCE_KEYS) {
    const value = raw[key]
    if (typeof value !== 'number') continue
    const next = (resources[key] ?? 0) + value * multiplier
    if (next < 0) return null
    if (next === 0) delete resources[key]
    else resources[key] = next
  }
  return { resources, sources: [...new Set([...base.sources, ...normalizeSources(raw.sources)])].sort() }
}

const bgaConditionsPass = (conditions: unknown, scenario: Scenario): boolean => {
  if (!conditions || typeof conditions !== 'object') return true
  const raw = conditions as Record<string, unknown>
  if (typeof raw.minNumRooms === 'number' && (scenario.units ?? scenario.rooms ?? 1) < raw.minNumRooms) return false
  if (typeof raw.houseTypeWood === 'number' && raw.houseTypeWood > 0 && scenario.houseType !== 'wood') return false
  if (typeof raw.houseTypeClay === 'number' && raw.houseTypeClay > 0 && scenario.houseType !== 'clay') return false
  if (typeof raw.houseTypeStone === 'number' && raw.houseTypeStone > 0 && scenario.houseType !== 'stone') return false
  return true
}

const bgaOptions = (cost: BgaCost, scenario: Scenario): PaymentOption[] => {
  const feeOptions = (cost.fees && cost.fees.length > 0 ? cost.fees : [{}]).map((fee) => ({
    resources: stripResources(fee),
    sources: normalizeSources(fee.sources),
  }))
  const unitCount = scenario.kind === 'renovation'
    ? scenario.rooms ?? 1
    : scenario.units ?? 1
  let options = cost.trades && cost.trades.length > 0
    ? feeOptions.flatMap((fee) =>
        cost.trades!.flatMap((trade) => {
          const applied = addCost(fee, trade, unitCount)
          return applied ? [applied] : []
        }))
    : feeOptions

  for (const bonus of cost.bonuses ?? []) {
    if (!bgaConditionsPass(bonus.conditions, scenario)) continue
    const isMultiChoice = Array.isArray(bonus.choices) && (bonus.choices as unknown[]).length > 1
    const choices = Array.isArray(bonus.choices) ? bonus.choices as Array<Record<string, unknown>> : [bonus]
    const old = options
    options = bonus.optional === true ? [...options] : []
    for (const option of old) {
      for (const choice of choices) {
        if (!bgaConditionsPass(choice.conditions, scenario)) continue
        const applied = addCost(option, choice)
        if (applied) options.push(isMultiChoice ? { ...applied, fromChoices: true } : applied)
      }
    }
    options = uniqueSortedOptions(options)
  }

  return pruneDominatedOptions(uniqueSortedOptions(options))
}

// Mirror of the production keepOnlyOptimals (ADR 0004 amendment): BGA's Pay
// layer prunes strictly dominated combinations before showing them, so the
// structurally-expanded fixture options must be pruned the same way to stay
// on the same comparison plane as OA's solver output. Choice expansions are
// exempt, mirroring OA's bonusChoiceIndex exemption.
const optionDominates = (a: PaymentOption, b: PaymentOption): boolean => {
  if (a.fromChoices || b.fromChoices) return false
  const keys = new Set([...Object.keys(a.resources), ...Object.keys(b.resources)])
  let strictlyLess = false
  for (const key of keys) {
    const aVal = a.resources[key] ?? 0
    const bVal = b.resources[key] ?? 0
    if (aVal > bVal) return false
    if (aVal < bVal) strictlyLess = true
  }
  return strictlyLess
}

const pruneDominatedOptions = (options: PaymentOption[]): PaymentOption[] =>
  options.filter((candidate) =>
    !options.some((other) => other !== candidate && optionDominates(other, candidate)),
  )

const mergeResourceDelta = (
  base: PaymentResourceMap,
  delta: Partial<Resource>,
): PaymentResourceMap => {
  const out: PaymentResourceMap = { ...base }
  for (const [key, value] of Object.entries(delta)) {
    if (typeof value !== 'number' || value === 0) continue
    const resourceKey = key as keyof Resource
    out[resourceKey] = (out[resourceKey] ?? 0) + value
  }
  return out
}

const formatResourceMap = (resources: Record<string, unknown> | undefined): string => {
  const normalized = stripResources(resources ?? {})
  const known = new Set<string>(RESOURCE_KEYS)
  const keys = [
    ...RESOURCE_KEYS.filter((key) => normalized[key] !== undefined),
    ...Object.keys(normalized).filter((key) => !known.has(key)).sort(),
  ]
  if (keys.length === 0) return '{}'
  return `{${keys.map((key) => `${key}:${normalized[key]}`).join(', ')}}`
}

const formatBaseCost = (cost: PaymentResourceMap | ComplexCost): string => {
  if (!isComplexCost(cost)) return formatResourceMap(cost)
  if (cost.fees?.length === 1) return formatResourceMap(cost.fees[0])
  if (cost.fee) return formatResourceMap(cost.fee)
  return JSON.stringify(cost)
}

const describeCardPurchaseSubject = (scenario: CardPurchaseScenario): string => {
  const cost = formatBaseCost(scenario.baseCost)
  if (scenario.targetId === 'Major_Joinery') {
    return `card-purchase generic major-cost fixture ${cost}`
  }
  return `card-purchase ${scenario.targetId} with fixture cost ${cost}`
}

const describePaymentSubject = (scenario: Scenario): string => {
  const details: string[] = []
  if (scenario.kind === 'card-purchase') {
    details.push(describeCardPurchaseSubject(scenario))
  } else if (scenario.kind === 'renovation') {
    details.push(`renovate-house ${scenario.houseType ?? 'wood'} -> ${scenario.targetHouseType ?? 'clay'}, rooms=${scenario.rooms ?? 3}`)
  } else if (scenario.kind === 'construct') {
    details.push(`construct ${scenario.houseType ?? 'wood'} room(s), units=${scenario.units ?? 1}`)
  } else if (scenario.kind === 'fencing') {
    details.push(`fence, units=${scenario.units ?? 1}`)
  } else {
    details.push(`stables, units=${scenario.units ?? 1}`)
  }
  if (scenario.sourceCard) details.push(`source=${scenario.sourceCard}`)
  if (scenario.actionCardId) details.push(`actionCard=${scenario.actionCardId}`)
  if (scenario.spaceId) details.push(`space=${scenario.spaceId}`)
  if (scenario.params) details.push(`params=${JSON.stringify(scenario.params)}`)
  return details.join(', ')
}

const appendAdjustments = (cost: ComplexCost, adjustments: ActionAdjustments): ComplexCost => {
  const next: ComplexCost = { ...cost }
  if (adjustments.trades.length > 0) next.trades = [...(next.trades ?? []), ...adjustments.trades]
  if (adjustments.bonuses.length > 0) next.bonuses = [...(next.bonuses ?? []), ...adjustments.bonuses]
  return next
}

const solutionSources = (solution: PaymentSolution, extraSources: string[] = []): string[] => {
  const sources = new Set(extraSources)
  for (const entry of solution.tradesUsed) {
    if (entry.times <= 0) continue
    const source = entry.trade.sourceId ?? entry.trade.source
    if (source) sources.add(source)
  }
  for (const source of solution.bonusUsed?.split(',') ?? []) {
    if (source) sources.add(source)
  }
  if (solution.cardUsed) sources.add(solution.cardUsed)
  return [...sources].sort()
}

const solutionToOption = (
  solution: PaymentSolution,
  extraSources: string[] = [],
): PaymentOption => ({
  resources: stripResources(solution.resourcesPaid as Record<string, unknown>),
  sources: solutionSources(solution, extraSources),
})

const playScenarioCards = (player: PlayerState, state: GameState, scenario: Scenario) => {
  for (const card of scenario.cards) {
    player[card.zone].push(card.id)
    player.activeModifiers.push(...getCardModifiers(card.id))
    const effect = getActiveCardRegistry()?.getEffect(card.id)
    if (card.id === 'E123_ResourceHoarder') effect?.onBuy?.(state, player)
  }
  for (const cardId of scenario.flaggedCards ?? []) {
    player.cardStates[cardId] = { ...(player.cardStates[cardId] ?? {}), flagged: true }
  }
  if (scenario.cards.some((card) => card.id === 'E87_MasterRenovator')) {
    getActiveCardRegistry()?.getEffect('E87_MasterRenovator')?.onStartReturnHome?.(state, player)
  }
}

const setupScenarioPlayer = (scenario: Scenario, resources = richResources) => {
  const player = createPlayer(resources)
  player.rooms = scenario.rooms ?? 3
  player.houseType = scenario.houseType ?? 'wood'
  const state = createState(player, scenario.round ?? 5)
  playScenarioCards(player, state, scenario)
  return { player, state }
}

const collectActionAdjustments = (
  scenario: ActionScenario,
  state: GameState,
  player: PlayerState,
): ActionAdjustments => {
  const params = scenario.params
    ?? (scenario.kind === 'renovation' && scenario.targetHouseType
      ? { selectedOption: scenario.targetHouseType }
      : undefined)
  const results = runCardListeners({
    state,
    player,
    space: createSpace(scenario.spaceId ?? scenario.kind),
    actionId: scenario.kind === 'renovation' ? 'renovate-house' : scenario.kind === 'fencing' ? 'fence' : scenario.kind,
    phase: 'computeCosts',
    sourceCard: scenario.sourceCard,
    params,
  })
  const costs: Partial<Resource> = {}
  const bonuses: Bonus[] = []
  const trades: Trade[] = []
  for (const result of results) {
    if (result.costs) {
      for (const [key, value] of Object.entries(result.costs)) {
        if (typeof value !== 'number') continue
        const resourceKey = key as keyof Resource
        costs[resourceKey] = (costs[resourceKey] ?? 0) + value
      }
    }
    if (result.bonuses) bonuses.push(...result.bonuses)
    if (result.trades) trades.push(...result.trades)
  }
  return { costs, bonuses, trades }
}

const costTypeFor = (kind: ActionScenario['kind']): CostModifierType =>
  kind === 'fencing' ? 'fencing' : kind

const actionCost = (
  scenario: ActionScenario,
  state: GameState,
  player: PlayerState,
): ComplexCost => {
  const adjustments = collectActionAdjustments(scenario, state, player)
  const units = scenario.units ?? 1
  if (scenario.kind === 'construct') {
    const cost = buildConstructCost(player, adjustments.costs, units)
    expect(cost, scenario.name).not.toBeNull()
    return appendAdjustments(cost!, adjustments)
  }
  if (scenario.kind === 'renovation') {
    const plan = buildRenovationPlan(player, scenario.targetHouseType ?? 'clay')
    expect(plan, scenario.name).not.toBeNull()
    const base = plan!.cost
    const cost: ComplexCost = {
      ...base,
      fees: [mergeResourceDelta(base.fees?.[0] ?? {}, adjustments.costs)],
    }
    return appendAdjustments(cost, adjustments)
  }
  const payableUnits = scenario.kind === 'fencing'
    ? Math.max(0, units - (scenario.pendingFenceBonus?.freeFences ?? 0))
    : units
  if (payableUnits === 0 && Object.keys(adjustments.costs).length === 0) {
    return appendAdjustments({ fee: {} }, adjustments)
  }
  const base: ComplexCost = {
    fees: Object.keys(adjustments.costs).length > 0 ? [adjustments.costs] : undefined,
    unitFee: { wood: scenario.kind === 'stables' ? 2 : 1 },
    nb: payableUnits,
  }
  return appendAdjustments(base, adjustments)
}

const actionExtraSources = (scenario: ActionScenario): string[] => {
  if (scenario.kind !== 'fencing') return []
  const usedFreeFences = Math.min(scenario.units ?? 1, scenario.pendingFenceBonus?.freeFences ?? 0)
  return usedFreeFences > 0 && scenario.pendingFenceBonus ? [scenario.pendingFenceBonus.sourceCard] : []
}

const oaCardPurchaseOptions = (scenario: CardPurchaseScenario): PaymentOption[] => {
  const { player, state } = setupScenarioPlayer(scenario)
  const result = resolveCardCostWithModifiersDetailed(
    state,
    player,
    'improvement',
    scenario.targetId,
    scenario.baseCost,
    scenario.actionCardId,
  )
  let cost = isComplexCost(result.cost) ? { ...result.cost } : { fee: result.cost }
  if (scenario.spaceId) {
    const extra = runCardListeners({
      state,
      player,
      space: createSpace(scenario.spaceId),
      actionId: 'improvement',
      phase: 'computeCosts',
      cardId: scenario.targetId,
      actionCardId: scenario.actionCardId,
    })
    for (const entry of extra) {
      if (entry.bonuses) cost = { ...cost, bonuses: [...(cost.bonuses ?? []), ...entry.bonuses] }
      if (entry.trades) cost = { ...cost, trades: [...(cost.trades ?? []), ...entry.trades] }
      if (entry.costs) cost = { ...cost, fee: mergeResourceDelta(cost.fee ?? {}, entry.costs) }
    }
  }
  const solutions = computeAllBuyableCombinations(player, cost, undefined, undefined, state)
  return uniqueSortedOptions(solutions.map((solution) => {
    const feeIndex = solution.feeIndex ?? 0
    const metadataSources = result.candidateMetadataByFeeIndex?.[feeIndex]?.sources ?? []
    return solutionToOption(solution, metadataSources)
  }))
}

const oaActionOptions = (scenario: ActionScenario): PaymentOption[] => {
  const { player, state } = setupScenarioPlayer(scenario)
  const cost = actionCost(scenario, state, player)
  const solutions = computeAllBuyableCombinations(player, cost, undefined, costTypeFor(scenario.kind), state)
  const extraSources = actionExtraSources(scenario)
  return uniqueSortedOptions(solutions.map((solution) => solutionToOption(solution, extraSources)))
}

const oaOptions = (scenario: Scenario): PaymentOption[] =>
  scenario.kind === 'card-purchase'
    ? oaCardPurchaseOptions(scenario)
    : oaActionOptions(scenario)

const renderReport = (
  diffs: ScenarioDiff[],
  covered: string[],
) => {
  const acceptedDiffs = diffs.filter((diff) => ACCEPTED_DIFF_REASONS[diff.name])
  const unresolvedDiffs = diffs.filter((diff) => !ACCEPTED_DIFF_REASONS[diff.name])
  const counts = scenarios.reduce<Record<string, number>>((acc, scenario) => {
    acc[scenario.kind] = (acc[scenario.kind] ?? 0) + 1
    return acc
  }, {})
  const diffKindCounts = diffs.reduce<Record<DiffKind, number>>((acc, diff) => {
    acc[diff.diffKind] = (acc[diff.diffKind] ?? 0) + 1
    return acc
  }, { 'payment-diff': 0, 'source-diff': 0 })
  const lines = [
    '# BGA/OA Cost-Pay Parity Report',
    '',
    `BGA covered compute-cost cards: ${covered.length}`,
    `Compared scenarios: ${scenarios.length}`,
    `Compared card-purchase scenarios: ${counts['card-purchase'] ?? 0}`,
    `Compared construct scenarios: ${counts.construct ?? 0}`,
    `Compared renovation scenarios: ${counts.renovation ?? 0}`,
    `Compared fencing scenarios: ${counts.fencing ?? 0}`,
    `Compared stables scenarios: ${counts.stables ?? 0}`,
    `Differences: ${diffs.length}`,
    `Payment differences: ${diffKindCounts['payment-diff']}`,
    `Source-only differences: ${diffKindCounts['source-diff']}`,
    `Accepted differences: ${acceptedDiffs.length}`,
    `Unresolved differences: ${unresolvedDiffs.length}`,
    'Report-only artifacts: 0',
    '',
  ]
  const pushDiff = (diff: ScenarioDiff, headingLevel = '###') => {
    lines.push(`${headingLevel} ${diff.name}`, '', `Kind: ${diff.kind}`, `Paying for: ${describePaymentSubject(diff.scenario)}`, `Difference type: ${diff.diffKind}`)
    const reason = ACCEPTED_DIFF_REASONS[diff.name]
    if (reason) lines.push(`Accepted reason: ${reason}`)
    lines.push('', 'BGA:', '```json', JSON.stringify(diff.bga, null, 2), '```', '', 'OA:', '```json', JSON.stringify(diff.oa, null, 2), '```', '')
  }
  lines.push('## Accepted Differences', '')
  if (acceptedDiffs.length === 0) {
    lines.push('No accepted differences.', '')
  } else {
    for (const diff of acceptedDiffs) pushDiff(diff)
  }
  lines.push('## Unresolved Differences', '')
  if (unresolvedDiffs.length === 0) {
    lines.push('No unresolved differences.', '')
  } else {
    for (const diff of unresolvedDiffs) pushDiff(diff)
  }
  mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
  writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`)
}

describe('BGA/OA cost-pay parity', () => {
  it('compares all BGA cost-pay scenarios against OA and writes a report', () => {
    const bga = getBgaPayload()
    expect(bga.singleCardCaseCount).toBe(53)
    expect(bga.comboCaseCount).toBe(5)
    expect(scenarios).toHaveLength(Object.keys(bga.results).length)
    for (const name of Object.keys(bga.results)) {
      expect(scenarios.some((scenario) => scenario.name === name), name).toBe(true)
    }

    const diffs = scenarios.flatMap((scenario) => {
      const bgaScenario = bga.results[scenario.name]
      expect(bgaScenario, scenario.name).toBeDefined()
      return compareOptions(scenario, bgaOptions(bgaScenario, scenario), oaOptions(scenario))
    })

    renderReport(diffs, bga.coveredCardIds)
    expect(readFileSync(REPORT_PATH, 'utf8')).toContain(`Differences: ${diffs.length}`)
    expect(readFileSync(REPORT_PATH, 'utf8')).toContain('Payment differences:')
    expect(readFileSync(REPORT_PATH, 'utf8')).toContain('Source-only differences:')
    expect(readFileSync(REPORT_PATH, 'utf8')).toContain('Accepted differences: 4')
    expect(readFileSync(REPORT_PATH, 'utf8')).toContain('Unresolved differences: 0')
    expect(readFileSync(REPORT_PATH, 'utf8')).toContain('## Accepted Differences')
    expect(readFileSync(REPORT_PATH, 'utf8')).toContain('## Unresolved Differences')
    expect(readFileSync(REPORT_PATH, 'utf8')).toContain('Report-only artifacts:')
    expect(readFileSync(REPORT_PATH, 'utf8')).toContain('Paying for: card-purchase generic major-cost fixture {wood:2, clay:2, reed:2, stone:2}')
    expect(readFileSync(REPORT_PATH, 'utf8')).not.toContain('Major_Joinery')
    expect(readFileSync(REPORT_PATH, 'utf8')).toContain('Paying for: renovate-house wood -> stone, rooms=3')
    expect(diffs.map((diff) => diff.name)).not.toContain('B145 brushwood renovation reed replacement')
    expect(diffs.map((diff) => diff.name)).not.toContain('C14 straw roof removes renovation reed')
    expect(diffs.map((diff) => diff.name)).not.toContain('B15 carpenters bench constrained free fence')
  })
})
