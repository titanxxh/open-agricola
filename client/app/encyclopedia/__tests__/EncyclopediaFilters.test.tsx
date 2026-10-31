// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { EncyclopediaBrowser } from '../EncyclopediaBrowser'
import { createEncyclopediaBrowseStore, type EncyclopediaBrowseStore } from '../encyclopedia-browse-store'
import type { EncyclopediaNavigation } from '../encyclopedia-navigation'
import { BASEBOARDS, COOKING_HEARTH, WINTER, cardEntry, encyclopediaOf, itemFor, parentEntry, stubImages } from './fixtures'

vi.stubGlobal('Image', stubImages(() => 'load'))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  Element.prototype.scrollIntoView = vi.fn()
})

const fillers = Array.from({ length: 24 }, (_, index) => {
  const number = String(index + 101)
  return cardEntry(`A${number}_Filler`, `A${number}`, { text: { name: [{ literal: `Filler ${number}` }] }, cost: { kind: 'unlisted' } })
})
const FARM_HAND = cardEntry('B085_FarmHand', 'B085', {
  publicType: 'occupation',
  face: { kind: 'card', cardId: 'B085_FarmHand', cardType: 'occupation' },
  cost: { kind: 'unlisted' },
})
const PR01 = parentEntry('PR01', 'mother', -0.75)

/** 29 entries: two pages of 24. */
const ENCYCLOPEDIA = encyclopediaOf([...fillers, BASEBOARDS, FARM_HAND, COOKING_HEARTH, PR01, WINTER].map(entry => itemFor(entry)))

const navigation: EncyclopediaNavigation = { selectedKey: null, openEntry: () => {}, closeEntry: () => {} }

const renderBrowser = (store: EncyclopediaBrowseStore = createEncyclopediaBrowseStore()) => {
  render(<EncyclopediaBrowser encyclopedia={ENCYCLOPEDIA} navigation={navigation} locale="en" store={store} />)
  return store
}

const sidebar = () => screen.getByRole('complementary', { name: 'Filters' })
const results = (count: number) => screen.findByRole('heading', { name: `Results: ${count}` })

describe('encyclopedia filter sidebar', () => {
  it('applies each change at once, any option within a group and every group together', async () => {
    const store = renderBrowser()
    store.setPage(2)
    await screen.findByText('Page 2 of 2')
    const deckB = within(sidebar()).getByRole('checkbox', { name: 'Deck B' })

    fireEvent.click(deckB)

    await results(1)
    expect(deckB).toBeChecked()
    expect(screen.queryByText(/^Page \d of \d$/)).toBeNull()

    fireEvent.click(within(sidebar()).getByRole('checkbox', { name: 'Deck A' }))
    await results(26)
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()

    fireEvent.click(within(sidebar()).getByRole('checkbox', { name: 'Food' }))
    await results(1)
    expect(screen.getByRole('button', { name: 'View Baseboards' })).toBeInTheDocument()
    expect(store.getState().filters).toEqual({
      groups: ['A', 'B'],
      types: [],
      cost: { resources: ['food'], upgradeReturn: false },
      points: { min: null, max: null, unlisted: false },
      extraVp: false,
    })
  })

  it('offers only the options this catalog can match', () => {
    renderBrowser()
    const group = (name: string) => within(within(sidebar()).getByRole('group', { name }))
      .getAllByRole('checkbox')
      .map(box => box.getAttribute('aria-label') ?? box.closest('label')?.textContent)

    expect(group('Deck or expansion')).toEqual(['Deck A', 'Deck B', 'Standard Major Improvements', 'Parent Cards', 'Through the Seasons'])
    expect(group('Card type')).toEqual(['Minor Improvement', 'Occupation', 'Major Improvement', 'Mother', 'Season Rule'])
    expect(group('Printed cost resources')).toEqual(['Clay', 'Food', 'Grain', 'Upgrade by returning a card'])
    expect(within(sidebar()).getByRole('group', { name: 'Printed cost resources' }))
      .toHaveAccessibleDescription('Matches if any printed cost option uses a selected resource')
  })

  it('narrows by an inclusive fixed points range, unlisted points and the bonus mark, then clears them all', async () => {
    const store = renderBrowser()
    const panel = within(sidebar())
    const minimum = panel.getByRole('spinbutton', { name: 'Minimum fixed points' })
    const maximum = panel.getByRole('spinbutton', { name: 'Maximum fixed points' })

    fireEvent.change(minimum, { target: { value: '-0.75' } })
    await results(2)
    fireEvent.change(maximum, { target: { value: '0' } })
    await results(1)
    expect(screen.getByRole('button', { name: 'View Mother PR01' })).toBeInTheDocument()

    fireEvent.click(panel.getByRole('checkbox', { name: 'No fixed points listed' }))
    await results(27)
    expect(screen.queryByRole('button', { name: 'View Winter' })).toBeNull()

    fireEvent.click(panel.getByRole('checkbox', { name: 'Marked with bonus points' }))
    await results(0)
    expect(store.getState().filters).toEqual({
      groups: [],
      types: [],
      cost: { resources: [], upgradeReturn: false },
      points: { min: -0.75, max: 0, unlisted: true },
      extraVp: true,
    })

    fireEvent.click(panel.getByRole('button', { name: 'Clear filters' }))

    await results(29)
    expect(minimum).toHaveValue(null)
    expect(maximum).toHaveValue(null)
    expect(panel.getByRole('checkbox', { name: 'No fixed points listed' })).not.toBeChecked()
    expect(panel.getByRole('button', { name: 'Clear filters' })).toBeDisabled()
  })
})

describe('encyclopedia phone filter panel', () => {
  const panel = () => within(screen.getByRole('dialog', { name: 'Filter cards' }))

  it('updates the results while open and keeps the conditions whichever way it closes', async () => {
    const store = renderBrowser()

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(panel().getByRole('checkbox', { name: 'Mother' }))
    expect(await panel().findByRole('button', { name: 'Show results (1)' })).toBeInTheDocument()
    await results(1)
    fireEvent.click(panel().getByRole('checkbox', { name: 'Season Rule' }))
    fireEvent.click(await panel().findByRole('button', { name: 'Show results (2)' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Filters (2)' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'View Winter' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filters (2)' }))
    expect(panel().getByRole('checkbox', { name: 'Mother' })).toBeChecked()
    fireEvent.change(panel().getByRole('spinbutton', { name: 'Minimum fixed points' }), { target: { value: '-0.75' } })
    expect(await panel().findByRole('button', { name: 'Show results (1)' })).toBeInTheDocument()
    fireEvent.click(panel().getByRole('button', { name: 'Close filters' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Filters (3)' })).toHaveFocus()
    await results(1)

    fireEvent.click(screen.getByRole('button', { name: 'Filters (3)' }))
    expect(panel().getByRole('spinbutton', { name: 'Minimum fixed points' })).toHaveValue(-0.75)
    fireEvent.click(panel().getByRole('checkbox', { name: 'Mother' }))
    await panel().findByRole('button', { name: 'Show results (0)' })
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))

    expect(screen.queryByRole('dialog')).toBeNull()
    await results(0)
    expect(store.getState().filters).toEqual({
      groups: [],
      types: ['season'],
      cost: { resources: [], upgradeReturn: false },
      points: { min: -0.75, max: null, unlisted: false },
      extraVp: false,
    })
  })
})
