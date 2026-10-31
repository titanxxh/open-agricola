// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EncyclopediaEntry } from '../../../../shared/contract/card-encyclopedia'
import { EncyclopediaFace } from '../EncyclopediaFace'
import { cardEntry, COOKING_HEARTH, itemFor, parentEntry, stubImages, WINTER } from './fixtures'

const special = (entry: Omit<EncyclopediaEntry, 'key' | 'displayNumber' | 'cost' | 'score'>): EncyclopediaEntry => ({
  key: `${entry.sourceKind}:${entry.sourceId}`,
  displayNumber: null,
  cost: { kind: 'notApplicable' },
  score: { fixed: null, extraVp: false },
  ...entry,
})

const WORK_MARKET_ACTIONS = ['fell-trees', 'hiring-fair', 'black-market', 'illicit-work'] as const

const WORK_MARKET = special({
  sourceKind: 'moorSpecialAction',
  sourceId: 'moor-special-1-3-work-market',
  group: 'moor',
  publicType: 'moorSpecialAction',
  players: { counts: [1, 3] },
  face: { kind: 'moorSpecialAction', image: '/assets/moor/special-action-card/moor-special-1-3-work-market.webp', actions: WORK_MARKET_ACTIONS },
  text: {
    name: WORK_MARKET_ACTIONS.flatMap((action, index) => [...(index ? [{ key: 'ui.listSeparator' }] : []), { key: `moor.specialActions.${action}` }]),
    body: [{ key: 'moor.specialActions.hiring-fair' }, { literal: ' · ' }, { key: 'moor.specialActions.effects.hiring-fair', params: { food: 1 } }],
  },
})

const moorStart = (number: number, tiles: Extract<EncyclopediaEntry['face'], { kind: 'moorStart' }>['tiles']) => special({
  sourceKind: 'moorStart',
  sourceId: `moor-start-${number}`,
  group: 'moor',
  publicType: 'moorStart',
  face: { kind: 'moorStart', tiles },
  text: { name: [{ key: 'ui.encyclopedia.moorStart.name', params: { number } }] },
})

const MOOR_START_1 = moorStart(1, [
  { row: 0, col: 3, kind: 'forest' }, { row: 1, col: 2, kind: 'forest' }, { row: 1, col: 3, kind: 'forest' },
  { row: 2, col: 3, kind: 'forest' }, { row: 2, col: 4, kind: 'forest' },
  { row: 0, col: 0, kind: 'moor' }, { row: 0, col: 1, kind: 'moor' }, { row: 1, col: 1, kind: 'moor' },
])

const terrainRows = () => within(screen.getByRole('table', { name: 'Starting terrain layout' }))
  .getAllByRole('row')
  .map(row => within(row).getAllByRole('cell').map(cell => cell.getAttribute('aria-label') ?? ''))

const MOOR_START_1_ROWS = [
  ['Moor', 'Moor', '', 'Forest', ''],
  ['', 'Moor', 'Forest', 'Forest', ''],
  ['', '', '', 'Forest', 'Forest'],
]

const broken = new Set<string>()
vi.stubGlobal('Image', stubImages(url => ([...broken].some(part => url.includes(part)) ? 'error' : 'load')))
afterEach(() => broken.clear())

const settleImages = () => act(async () => { await Promise.resolve() })

/** Image probes are cached for the page's lifetime; faces whose art every entry shares need a fresh page to fail. */
const faceOnFreshPage = async () => {
  vi.resetModules()
  await import('../../../../tests/setup-language-packs')
  return (await import('../EncyclopediaFace')).EncyclopediaFace
}

describe('encyclopedia card faces', () => {
  it('shows the printed card face when its art loads', async () => {
    const { container } = render(<EncyclopediaFace item={itemFor(cardEntry('A006_StorageBarn', 'A006'))} locale="en" />)
    await settleImages()

    expect(container.querySelector('.player-card [data-id="A006_StorageBarn"]')).not.toBeNull()
    expect(screen.queryByText('Image unavailable')).toBeNull()
  })

  it('keeps the name, number and card text on a text face when a card image fails', async () => {
    broken.add('/deckA/A005')
    const { container } = render(<EncyclopediaFace item={itemFor(cardEntry('A005_ClayEmbankment', 'A005'))} locale="en" />)

    expect(await screen.findByText('Image unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Clay Embankment' })).toBeInTheDocument()
    expect(screen.getByText('A005')).toBeInTheDocument()
    expect(container.textContent).toContain('for every 2')
    expect(container.querySelector('.player-card')).toBeNull()
  })

  it('falls back from the major improvement icon sheet as well', async () => {
    broken.add('/majors_icons.jpg')
    render(<EncyclopediaFace item={itemFor(COOKING_HEARTH)} locale="en" />)

    expect(await screen.findByText('Image unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cooking Hearth' })).toBeInTheDocument()
  })

  it('shows the parent card face when its portrait loads and a text face when it fails', async () => {
    const loaded = render(<EncyclopediaFace item={itemFor(parentEntry('PR03', 'mother', 0))} locale="en" />)
    await settleImages()
    expect(loaded.container.querySelector('.parent-card-face')).not.toBeNull()
    loaded.unmount()

    broken.add('/parents/portrait/')
    const failed = render(<EncyclopediaFace item={itemFor(parentEntry('PR02', 'mother', -0.25))} locale="en" />)

    expect(await screen.findByText('Image unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mother PR02' })).toBeInTheDocument()
    expect(failed.container.textContent).toContain('Place 1 field tile on round space 12.')
    expect(failed.container.querySelector('.parent-card-face')).toBeNull()
  })

  it('shows a moor special action card with its art and the effects printed for each player count', async () => {
    const { container } = render(<EncyclopediaFace item={itemFor(WORK_MARKET)} locale="en" />)
    await settleImages()

    expect(container.querySelector('img')?.getAttribute('src')).toContain('/assets/moor/special-action-card/moor-special-1-3-work-market.webp')
    const card = screen.getByRole('group', { name: 'Fell Trees, Hiring Fair, Black Market, Illicit Work' })
    expect(within(card).getByText('1/3 players')).toBeInTheDocument()
    expect(within(card).getAllByText(/^(Fell Trees|Hiring Fair|Black Market|Illicit Work)$/).map(label => label.textContent))
      .toEqual(['Fell Trees', 'Hiring Fair', 'Black Market', 'Illicit Work'])
    expect(within(card).getByRole('img', { name: 'Remove 1 forest to gain 2 wood' })).toBeInTheDocument()
    expect(within(card).getByText('1 players')).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: 'Gain 1 food' })).toBeInTheDocument()
    expect(within(card).getByText('3 players')).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: 'Gain 2 food' })).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: 'Pay 1 fuel to buy 1 minor improvement' })).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: 'Pay 1 food and 1 fuel to buy 1 major improvement' })).toBeInTheDocument()
    expect(within(card).getAllByText('Pay improvement cost separately')).toHaveLength(2)
    expect(within(card).queryByRole('button')).toBeNull()
    expect(screen.queryByText('Image unavailable')).toBeNull()
  })

  it('falls back to the text face when the special action art fails', async () => {
    broken.add('moor-special-6-peat.webp')
    const peat = special({
      sourceKind: 'moorSpecialAction',
      sourceId: 'moor-special-6-peat',
      group: 'moor',
      publicType: 'moorSpecialAction',
      players: { counts: [6] },
      face: { kind: 'moorSpecialAction', image: '/assets/moor/special-action-card/moor-special-6-peat.webp', actions: ['cut-peat'] },
      text: {
        name: [{ key: 'moor.specialActions.cut-peat' }],
        body: [{ key: 'moor.specialActions.cut-peat' }, { literal: ' · ' }, { key: 'moor.specialActions.effects.cut-peat', params: { fuel: 3 } }],
      },
    })
    const { container } = render(<EncyclopediaFace item={itemFor(peat)} locale="en" />)

    expect(await screen.findByText('Image unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cut Peat' })).toBeInTheDocument()
    expect(container.textContent).toContain('Cut Peat · Remove 1 moor to gain 3 fuel')
    expect(container.querySelector('img')).toBeNull()
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('lays out a starting terrain card on the farm ground used in game', async () => {
    const { container } = render(<EncyclopediaFace item={itemFor(MOOR_START_1)} locale="en" />)
    await settleImages()

    expect(terrainRows()).toEqual(MOOR_START_1_ROWS)
    expect(container.querySelectorAll('.farm-terrain-sprite-forest')).toHaveLength(5)
    expect(container.querySelectorAll('.farm-terrain-sprite-moor')).toHaveLength(3)
    expect(container.querySelectorAll('.empty-node')).toHaveLength(7)
    expect(screen.queryByText('Image unavailable')).toBeNull()
  })

  it('keeps the starting terrain layout on the text face when the terrain art fails', async () => {
    broken.add('/moor/terrain/forest.webp')
    const FreshFace = await faceOnFreshPage()
    const { container } = render(<FreshFace item={itemFor(MOOR_START_1)} locale="en" />)

    expect(await screen.findByText('Image unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Starting Terrain 1' })).toBeInTheDocument()
    expect(terrainRows()).toEqual(MOOR_START_1_ROWS)
    expect(container.querySelector('.farm-terrain-sprite, .empty-node')).toBeNull()
  })

  it('shows a season with its action card and the board changes it brings', async () => {
    const { container } = render(<EncyclopediaFace item={itemFor(WINTER)} locale="en" />)
    await settleImages()

    const season = screen.getByRole('group', { name: 'Winter' })
    const actionCard = container.querySelector('.seasons-board__season-action-card')
    expect(actionCard?.querySelector('.seasons-board__action-header')?.textContent).toBe('Romantic Evening')
    expect(actionCard?.textContent).toContain('even without room')
    expect(within(season).getByText('plowing a field:')).toBeInTheDocument()
    expect(within(season).getByText('Fishing: not until Round 11')).toBeInTheDocument()
    expect(container.querySelectorAll('.seasons-board__resource-adjustment')).toHaveLength(2)
    expect(container.querySelector('.seasons-board__accumulation-arrow')).not.toBeNull()
    expect(screen.queryByText('Houses need no heating')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('Image unavailable')).toBeNull()
  })

  it('reads the season rules from the text face when the board art fails', async () => {
    broken.add('through-the-seasons-clean-background.jpg')
    const FreshFace = await faceOnFreshPage()
    const { container } = render(<FreshFace item={itemFor(WINTER)} locale="en" />)

    expect(await screen.findByText('Image unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Winter' })).toBeInTheDocument()
    expect(container.textContent).toContain('Romantic Evening · ')
    expect(container.querySelector('.seasons-board__season-action-card')).toBeNull()
  })
})
