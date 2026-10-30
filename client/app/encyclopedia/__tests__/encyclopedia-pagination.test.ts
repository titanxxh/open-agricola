import { describe, expect, it } from 'vitest'
import { paginateEncyclopedia } from '../encyclopedia-pagination'

const numbered = (count: number) => Array.from({ length: count }, (_, index) => index + 1)

describe('encyclopedia pagination', () => {
  it('splits results into pages of 24 without omission, duplication or reordering', () => {
    const results = numbered(50)
    const pages = [1, 2, 3].map(page => paginateEncyclopedia(results, page))

    expect(pages.map(page => page.items.length)).toEqual([24, 24, 2])
    expect(pages[1]!.items[0]).toBe(25)
    expect(pages[2]!.items).toEqual([49, 50])
    expect(pages.flatMap(page => page.items)).toEqual(results)
    expect(pages.map(page => [page.page, page.pageCount, page.total])).toEqual([[1, 3, 50], [2, 3, 50], [3, 3, 50]])
  })

  it('fills the last page exactly when results divide evenly', () => {
    expect(paginateEncyclopedia(numbered(48), 2)).toMatchObject({ page: 2, pageCount: 2 })
    expect(paginateEncyclopedia(numbered(48), 2).items).toHaveLength(24)
  })

  it('pulls a page past the end back to the last page when results shrink', () => {
    const slice = paginateEncyclopedia(numbered(30), 5)

    expect(slice.page).toBe(2)
    expect(slice.items).toEqual([25, 26, 27, 28, 29, 30])
  })

  it('treats a missing or invalid page as the first page', () => {
    expect(paginateEncyclopedia(numbered(30), 0).items[0]).toBe(1)
    expect(paginateEncyclopedia(numbered(30), Number.NaN).page).toBe(1)
    expect(paginateEncyclopedia(numbered(30), 1.5).page).toBe(1)
  })

  it('has a single empty page when nothing matches', () => {
    expect(paginateEncyclopedia([], 3)).toEqual({ items: [], page: 1, pageCount: 1, total: 0 })
  })
})
