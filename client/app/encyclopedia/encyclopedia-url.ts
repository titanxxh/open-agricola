export const ENCYCLOPEDIA_ENTRY_PARAM = 'entry'

type PageLocation = Pick<Location, 'pathname' | 'search' | 'hash'>

export const readEncyclopediaEntry = (search: string): string | null =>
  new URLSearchParams(search).get(ENCYCLOPEDIA_ENTRY_PARAM) || null

export const encyclopediaEntryHref = (location: PageLocation, key: string | null): string => {
  const params = new URLSearchParams(location.search)
  if (key === null) params.delete(ENCYCLOPEDIA_ENTRY_PARAM)
  else params.set(ENCYCLOPEDIA_ENTRY_PARAM, key)
  const search = params.toString()
  return `${location.pathname}${search ? `?${search}` : ''}${location.hash}`
}

/** Built from scratch so a shared link never carries the sharer's room, seat or other page state. */
export const encyclopediaShareUrl = (
  key: string,
  origin: string = window.location.origin,
  base: string = import.meta.env.BASE_URL,
): string => {
  const url = new URL(base, origin)
  url.search = new URLSearchParams({ page: 'encyclopedia', [ENCYCLOPEDIA_ENTRY_PARAM]: key }).toString()
  return url.toString()
}
