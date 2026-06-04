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
import { confirmPlayerSwitch } from '../../../server/__tests__/_helpers/pending-confirms'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const cardsDisplayRoot = path.join(repoRoot, 'shared/cards')

const manifest = () => buildCardsManifest(cardsDisplayRoot)

describe('Card Source representative migrations', () => {
  it('projects metadata-only Card Source through the production manifest path', () => {
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
    expect(ALL_CARD_IMPLS).not.toHaveProperty('A169_OffSiter')
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
})
