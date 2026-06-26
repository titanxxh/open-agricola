import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCardsManifest } from '../../../scripts/build-cards-manifest'
import { ALL_CARD_IMPLS } from '../register-all'
import { GameSession } from '../../../server/game/authoritative-session'
import { setWorkersAtHome } from '../../domain/player'
import { computeAllBuyableCombinations } from '../../actions/payment/internal'
import { runCardEffectHook } from '../card-effects'
import { getCardDefinition } from '../catalog'
import { implementedMinorImprovementCardsList, minorImprovementCardsList } from '../catalog.generated'
import { confirmPlayerSwitch } from '../../../server/__tests__/_helpers/pending-confirms'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const cardsDisplayRoot = path.join(repoRoot, 'shared/cards')

const manifest = () => buildCardsManifest(cardsDisplayRoot)

describe('Card Source representative migrations', () => {
  it('projects A169 Card Source through the production manifest path', () => {
    const entry = manifest()['A169_OffSiter']

    expect(entry?.module).toBe('shared/cards/A/A169_OffSiter')
    expect(entry?.meta).toEqual({
      id: 'A169_OffSiter',
      name: 'Off-Siter',
      deck: 'A',
      number: 169,
      type: 'occupation',
      category: 'FARM_PLANNER',
      desc: [
        'Once the total printed building cost of all the major improvements you have is at least 9 building resources, this card provides room for 1 person for the rest of the game.',
      ],
      cost: {},
      players: '5+',
    })
    expect(ALL_CARD_IMPLS.A169_OffSiter?.effect?.computeExtraRoomCapacity).toEqual(expect.any(Function))
  })

  it('keeps Working Gloves modifiers under Card Source impl and effective in payment', () => {
    const impl = ALL_CARD_IMPLS['E60_WorkingGloves']
    const definition = getCardDefinition('E60_WorkingGloves')

    expect(manifest()['E60_WorkingGloves']?.module).toBe('shared/cards/E/E60_WorkingGloves')
    expect(definition?.modifier).toBeUndefined()
    expect(definition?.modifiers).toBeUndefined()
    expect(impl?.modifiers).toHaveLength(4)
    expect(impl?.effect?.onBuy).toEqual(expect.any(Function))

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push('E60_WorkingGloves')
    player.resources = {
      ...player.resources,
      wood: 1,
      clay: 1,
      reed: 1,
      stone: 1,
      food: 4,
    }
    session.loadState(state)

    const after = session.getState().state.players[0]!
    expect(after.activeModifiers.filter((m) => m.cardId === 'E60_WorkingGloves')).toHaveLength(4)

    const solutions = computeAllBuyableCombinations(
      after,
      { fee: { food: 2 } },
      undefined,
      'occupation',
    )

    expect(solutions.some((s) => (s.resourcesPaid.food ?? 0) === 2)).toBe(true)
    for (const res of ['wood', 'clay', 'reed', 'stone'] as const) {
      expect(solutions.some((s) => (s.resourcesPaid.food ?? 0) === 0 && (s.resourcesPaid[res] ?? 0) === 1)).toBe(true)
    }
  })

  it('loads Barn Shed listener from Card Source impl through session runtime', () => {
    expect(manifest()['E66_BarnShed']?.module).toBe('shared/cards/E/E66_BarnShed')
    expect(ALL_CARD_IMPLS['E66_BarnShed']?.listeners?.map((listener) => listener.id)).toContain(
      'E66-barn-shed-opponent-forest',
    )

    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    state.currentPlayerIndex = 1
    state.round = 1
    const owner = state.players[0]!
    owner.minorPlayed.push('E66_BarnShed')
    owner.resources.grain = 0
    setWorkersAtHome(state, owner, 2)
    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    state.players.slice(2).forEach((player) => setWorkersAtHome(state, player, 0))
    const forest = state.actionSpaces.find((space) => space.id === 'forest')
    if (forest) forest.resources.wood = 3
    session.loadState(state)

    let resp = session.takeAction(1, 'forest')
    expect(resp.ok).toBe(true)
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    expect(session.getState().state.players[0]?.resources.grain).toBe(1)
  })

  it('loads Well major metadata and onBuy runtime hook from Card Source', () => {
    const entry = manifest()['Major_Well']
    const impl = ALL_CARD_IMPLS['Major_Well']

    expect(entry?.module).toBe('shared/cards/major/well')
    expect(entry?.meta).toMatchObject({
      id: 'Major_Well',
      name: 'Well',
      deck: 'major',
      number: 7,
      type: 'major',
      cost: { wood: 1, stone: 3 },
      vp: 4,
    })
    expect(impl?.effect?.onBuy).toEqual(expect.any(Function))

    const session = new GameSession()
    const state = session.getState().state
    state.round = 1
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'Major_Well', 'onBuy')

    expect(flow).toEqual({ type: 'leaf', actionId: 'future-meeples' })
    expect(state.pendingFutureMeeples).toEqual([
      {
        cardId: 'Major_Well',
        playerId: player.id,
        startRound: 2,
        count: 5,
        resources: { food: 1 },
      },
    ])
  })

  it('projects Farmers of the Moor major cards from split source files', () => {
    const entries = manifest()

    expect(Object.fromEntries([
      'Major_Moor_HorseSlaughterhouse1',
      'Major_Moor_HorseSlaughterhouse2',
      'Major_Moor_Cookhouse1',
      'Major_Moor_Cookhouse2',
      'Major_Moor_PeatCharcoalKiln',
      'Major_Moor_ForestersLodge',
      'Major_Moor_RidingStables',
      'Major_Moor_MuseumOfTheMoors',
      'Major_Moor_HeatingOven',
      'Major_Moor_TiledOven',
      'Major_Moor_VillageChurch',
      'Major_Moor_FurnitureStall',
      'Major_Moor_CeramicsStall',
      'Major_Moor_BasketStall',
    ].map((id) => [id, entries[id]?.module]))).toEqual({
      Major_Moor_HorseSlaughterhouse1: 'shared/cards/major/moor-horse-slaughterhouse',
      Major_Moor_HorseSlaughterhouse2: 'shared/cards/major/moor-horse-slaughterhouse',
      Major_Moor_Cookhouse1: 'shared/cards/major/moor-cookhouse',
      Major_Moor_Cookhouse2: 'shared/cards/major/moor-cookhouse',
      Major_Moor_PeatCharcoalKiln: 'shared/cards/major/moor-peat-charcoal-kiln',
      Major_Moor_ForestersLodge: 'shared/cards/major/moor-foresters-lodge',
      Major_Moor_RidingStables: 'shared/cards/major/moor-riding-stables',
      Major_Moor_MuseumOfTheMoors: 'shared/cards/major/moor-museum-of-the-moors',
      Major_Moor_HeatingOven: 'shared/cards/major/moor-heating-oven',
      Major_Moor_TiledOven: 'shared/cards/major/moor-tiled-oven',
      Major_Moor_VillageChurch: 'shared/cards/major/moor-village-church',
      Major_Moor_FurnitureStall: 'shared/cards/major/moor-furniture-stall',
      Major_Moor_CeramicsStall: 'shared/cards/major/moor-ceramics-stall',
      Major_Moor_BasketStall: 'shared/cards/major/moor-basket-stall',
    })
  })

  it('projects Farmers of the Moor minor cards with implemented Batch 1 runtime definitions', () => {
    const entries = manifest()
    const moorMinors = Object.values(entries)
      .filter((entry) => entry.meta.type === 'minor' && entry.meta.deck === 'M')
      .sort((a, b) => a.meta.number - b.meta.number)
    const implementedBatch1 = [
      'M019_LawnTurf',
      'M020_PeatPellets',
      'M022_EcologicalNiche',
      'M024_BasicSupplies',
      'M025_HouseholdInventory',
      'M026_ChimneyHood',
      'M028_OutOnTheWallaby',
      'M029_Tinker',
      'M065_FireBrigade',
      'M080_AdvancePayment',
      'M100_Pheromones',
    ]

    expect(moorMinors.map((entry) => entry.meta.number)).toEqual(
      Array.from({ length: 117 }, (_, index) => index + 15),
    )
    expect(moorMinors.every((entry) => entry.meta.requiresFarmersOfTheMoor === true)).toBe(true)
    expect(moorMinors.filter((entry) => entry.meta.implemented).map((entry) => entry.meta.id)).toEqual(implementedBatch1)
    expect(moorMinors.filter((entry) => entry.meta.implemented === false)).toHaveLength(106)
    expect(moorMinors.every((entry) => entry.module.startsWith('shared/cards/M/'))).toBe(true)

    expect(entries['M015_PeatBurnOff']?.meta).toMatchObject({
      id: 'M015_PeatBurnOff',
      name: 'Peat Burn-off',
      category: 'FARM_PLANNER',
      passing: true,
      desc: [
        'You immediately get 1 <FUEL>. Additionally, you can immediately exchange 1 moor for 1 field tile.',
      ],
    })
    expect(entries['M032_PeatHut']?.meta).toMatchObject({
      id: 'M032_PeatHut',
      name: 'Peat Hut',
      category: 'FARM_PLANNER',
      cost: { fuel: 5, reed: 2 },
      vp: 1,
    })
    expect(entries['M032_PeatHut']?.meta.passing).toBeUndefined()
    expect(entries['M131_CattleStall']?.meta).toMatchObject({
      id: 'M131_CattleStall',
      name: 'Cattle Stall',
      category: 'LIVESTOCK_PROVIDER',
      cost: { wood: 2, clay: 2 },
      vp: 1,
    })
    expect(minorImprovementCardsList.filter((card) => card.deck === 'M')).toHaveLength(117)
    expect(implementedMinorImprovementCardsList.filter((card) => card.deck === 'M').map((card) => card.id)).toEqual(implementedBatch1)
  })
})
