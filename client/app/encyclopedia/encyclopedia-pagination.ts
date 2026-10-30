export const ENCYCLOPEDIA_PAGE_SIZE = 24

export type EncyclopediaPageSlice<T> = Readonly<{
  items: readonly T[]
  /** 1-based and always within `1..pageCount`. */
  page: number
  pageCount: number
  total: number
}>

export function paginateEncyclopedia<T>(
  results: readonly T[],
  page: number,
  pageSize: number = ENCYCLOPEDIA_PAGE_SIZE,
): EncyclopediaPageSlice<T> {
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize))
  const current = Number.isInteger(page) ? Math.min(Math.max(page, 1), pageCount) : 1
  const start = (current - 1) * pageSize
  return { items: results.slice(start, start + pageSize), page: current, pageCount, total: results.length }
}
