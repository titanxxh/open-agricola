// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../../../contexts/LocaleContext'
import { loadCardEncyclopedia } from '../../../services/card-encyclopedia'
import { EncyclopediaPage } from '../EncyclopediaPage'
import { encyclopediaBrowseStore } from '../encyclopedia-browse-store'
import { cardEntry, encyclopediaOf, itemFor } from './fixtures'

vi.mock('../../../services/card-encyclopedia', () => ({ loadCardEncyclopedia: vi.fn() }))
const load = vi.mocked(loadCardEncyclopedia)

const numbered = (count: number) => encyclopediaOf(Array.from({ length: count }, (_, index) => {
  const number = String(index + 1).padStart(2, '0')
  return itemFor(cardEntry(`T${number}_Entry`, `T${number}`, { group: 'A', text: { name: [{ literal: `Entry ${number}` }] } }))
}))

const galleryNames = () => within(screen.getByRole('list'))
  .getAllByRole('button')
  .map(button => button.getAttribute('aria-label'))

const renderPage = () => render(<LocaleProvider><EncyclopediaPage /></LocaleProvider>)

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  window.localStorage.setItem('open-agricola-locale-v2', 'en')
  window.history.replaceState(null, '', '/?page=encyclopedia')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  encyclopediaBrowseStore.reset()
  load.mockReset()
  vi.restoreAllMocks()
})

describe('encyclopedia page', () => {
  it('offers a retry after the catalog fails to load and keeps the browse state', async () => {
    load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(numbered(30))
    encyclopediaBrowseStore.setPage(2)
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load the encyclopedia")
    expect(alert).toHaveTextContent('Your search and filters are kept.')

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('heading', { name: 'Results: 30' })).toBeInTheDocument()
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('shows 24 entries per page in catalog order', async () => {
    load.mockResolvedValue(numbered(30))
    renderPage()

    await screen.findByText('Page 1 of 2')
    expect(galleryNames()).toEqual(Array.from({ length: 24 }, (_, index) => `View Entry ${String(index + 1).padStart(2, '0')}`))
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))

    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    expect(galleryNames()).toEqual(['25', '26', '27', '28', '29', '30'].map(number => `View Entry ${number}`))
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })

  it('closes a detail opened from the results back onto the same page and card', async () => {
    load.mockResolvedValue(numbered(30))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }))
    const opener = screen.getByRole('button', { name: 'View Entry 27' })

    fireEvent.click(opener)

    expect(new URLSearchParams(window.location.search).get('entry')).toBe('card:T27_Entry')
    expect(within(screen.getByRole('dialog')).getByRole('heading', { level: 2, name: 'Entry 27' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))

    await waitFor(() => expect(window.location.search).toBe('?page=encyclopedia'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View Entry 27' })).toHaveFocus()
  })

  it('follows Back and Forward between the results and a detail', async () => {
    load.mockResolvedValue(numbered(30))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'View Entry 05' }))

    act(() => window.history.back())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    act(() => window.history.forward())
    expect(await screen.findByRole('dialog')).toHaveAccessibleName('Entry 05')
  })

  it('closes a shared link onto the whole catalog without leaving a history entry', async () => {
    window.history.replaceState(null, '', '/?page=encyclopedia&entry=card%3AT05_Entry')
    load.mockResolvedValue(numbered(30))
    renderPage()
    expect(await screen.findByRole('dialog')).toHaveAccessibleName('Entry 05')
    const historyLength = window.history.length

    fireEvent.click(screen.getByRole('button', { name: 'Back to results' }))

    expect(window.location.search).toBe('?page=encyclopedia')
    expect(window.history.length).toBe(historyLength)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
  })

  it('reports an unknown entry and returns to the catalog', async () => {
    window.history.replaceState(null, '', '/?page=encyclopedia&entry=card%3AT99_Entry')
    load.mockResolvedValue(numbered(30))
    renderPage()

    expect(await screen.findByRole('dialog')).toHaveAccessibleName('Not in the encyclopedia')

    fireEvent.click(screen.getByRole('button', { name: 'Back to catalog' }))

    expect(window.location.search).toBe('?page=encyclopedia')
    expect(screen.getByRole('heading', { name: 'Results: 30' })).toBeInTheDocument()
  })

  it('has no page controls when nothing matches', async () => {
    load.mockResolvedValue(encyclopediaOf([]))
    renderPage()

    expect(await screen.findByRole('heading', { name: 'No matching cards' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Results: 0' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull()
  })

  it('returns to the saved page and scroll position when the page mounts again', async () => {
    load.mockResolvedValue(numbered(30))
    const first = renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }))
    first.unmount()
    encyclopediaBrowseStore.setScrollTop(640)

    renderPage()

    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 640)
  })
})
