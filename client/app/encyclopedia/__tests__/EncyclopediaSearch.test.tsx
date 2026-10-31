// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Locale } from '../../../../shared/i18n'
import { EncyclopediaBrowser } from '../EncyclopediaBrowser'
import { createEncyclopediaBrowseStore, type EncyclopediaBrowseStore } from '../encyclopedia-browse-store'
import { cardEntry, encyclopediaOf } from './fixtures'
import { searchable } from './search-fixtures'

const numbered = Array.from({ length: 30 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0')
  return searchable(
    cardEntry(`T${number}_Entry`, `T${number}`, { group: 'A', text: { name: [{ literal: `Entry ${number}` }] } }),
    { name: `Entry ${number}`, body: index % 2 === 0 ? 'Gain 1 Wood .' : 'Gain 1 Clay .' },
    { name: `条目 ${number}`, body: index % 2 === 0 ? '获得1 木材 。' : '获得1 黏土 。' },
    index % 2 === 0 ? ['Wood', '木材', '木头'] : ['Clay', '黏土'],
  )
})
const encyclopedia = encyclopediaOf(numbered)

const navigation = { selectedKey: null, openEntry: vi.fn(), closeEntry: vi.fn() }

const renderBrowser = (store: EncyclopediaBrowseStore = createEncyclopediaBrowseStore(), locale: Locale = 'en') => {
  render(<EncyclopediaBrowser encyclopedia={encyclopedia} navigation={navigation} locale={locale} store={store} />)
  return store
}

const searchBox = () => screen.getByRole('searchbox', { name: 'Search cards' })
const galleryNames = () => within(screen.getByRole('list')).getAllByRole('button').map(button => button.getAttribute('aria-label'))

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

describe('encyclopedia search box', () => {
  it('narrows the gallery while typing and goes back to the first page', async () => {
    const store = createEncyclopediaBrowseStore()
    store.setPage(2)
    renderBrowser(store)
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()

    fireEvent.change(searchBox(), { target: { value: 'entry' } })
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument()

    fireEvent.change(searchBox(), { target: { value: 'entry 2' } })
    expect(await screen.findByRole('heading', { name: 'Results: 12' })).toBeInTheDocument()
    expect(galleryNames()).toEqual(['02', '12', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29'].map(number => `View Entry ${number}`))
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull()
    expect(store.getState()).toMatchObject({ query: 'entry 2', page: 1 })
  })

  it('leaves the results alone while an input method is still composing', async () => {
    const store = renderBrowser(createEncyclopediaBrowseStore(), 'zh')
    const input = screen.getByRole('searchbox', { name: '搜索卡牌' })

    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'mu' } })
    fireEvent.change(input, { target: { value: 'mu tou' } })

    expect(input).toHaveValue('mu tou')
    expect(store.getState().query).toBe('')
    expect(screen.getByRole('heading', { name: '30 条结果' })).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '木头' } })
    fireEvent.compositionEnd(input)

    expect(await screen.findByRole('heading', { name: '15 条结果' })).toBeInTheDocument()
    expect(store.getState().query).toBe('木头')
    expect(galleryNames()[0]).toBe('查看 Entry 01')
  })

  it('keeps the query when nothing matches and clears only the query from the box', async () => {
    const store = renderBrowser()
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()

    fireEvent.change(searchBox(), { target: { value: 'zzz' } })

    expect(await screen.findByRole('heading', { name: 'No matching cards' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Results: 0' })).toBeInTheDocument()
    expect(searchBox()).toHaveValue('zzz')

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(await screen.findByRole('heading', { name: 'Results: 30' })).toBeInTheDocument()
    expect(searchBox()).toHaveValue('')
    expect(searchBox()).toHaveFocus()
    expect(store.getState().query).toBe('')
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
  })

  it('shows the query already kept for this tab and follows a reset from the empty results', async () => {
    const store = createEncyclopediaBrowseStore()
    store.setQuery('木头 zzz')
    renderBrowser(store)

    expect(searchBox()).toHaveValue('木头 zzz')
    fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }))

    expect(await screen.findByRole('heading', { name: 'Results: 30' })).toBeInTheDocument()
    expect(searchBox()).toHaveValue('')
  })

  it('suggests example queries and says both languages are searched', () => {
    renderBrowser()

    expect(searchBox()).toHaveAttribute('placeholder', 'Search names, numbers, or card text…')
    expect(searchBox()).toHaveAccessibleDescription('Try A004, fireplace, or wood')
    expect(screen.getByText('Searches both Chinese and English')).toBeInTheDocument()
  })
})
