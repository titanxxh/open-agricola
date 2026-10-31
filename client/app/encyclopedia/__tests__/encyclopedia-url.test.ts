// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { encyclopediaEntryHref, encyclopediaShareUrl, readEncyclopediaEntry } from '../encyclopedia-url'

afterEach(() => window.history.replaceState(null, '', '/'))

describe('encyclopedia links', () => {
  it('shares only the page and entry identity, never the current room, seat or view', () => {
    window.history.replaceState(null, '', '/?page=encyclopedia&entry=card%3AA001_Shelter&room=room-1&player=p2&devMode=1&bg=winter')

    expect(encyclopediaShareUrl('card:A004_Baseboards', 'https://open-agricola.titanxxh.com', '/open-agricola/'))
      .toBe('https://open-agricola.titanxxh.com/open-agricola/?page=encyclopedia&entry=card%3AA004_Baseboards')
    expect(Object.fromEntries(new URL(encyclopediaShareUrl('parent:PR01')).searchParams))
      .toEqual({ page: 'encyclopedia', entry: 'parent:PR01' })
    expect(new URL(encyclopediaShareUrl('parent:PR01')).origin).toBe(window.location.origin)
  })

  it('reads the entry identity exactly as linked', () => {
    expect(readEncyclopediaEntry('?page=encyclopedia&entry=moorStart%3Amoor-start-1')).toBe('moorStart:moor-start-1')
    expect(readEncyclopediaEntry('?page=encyclopedia&entry=Baseboards')).toBe('Baseboards')
    expect(readEncyclopediaEntry('?page=encyclopedia')).toBeNull()
    expect(readEncyclopediaEntry('?page=encyclopedia&entry=')).toBeNull()
  })

  it('changes only the entry parameter of the current page URL', () => {
    const location = { pathname: '/open-agricola/', search: '?page=encyclopedia&bg=winter', hash: '' }

    expect(encyclopediaEntryHref(location, 'season:winter'))
      .toBe('/open-agricola/?page=encyclopedia&bg=winter&entry=season%3Awinter')
    expect(encyclopediaEntryHref({ ...location, search: '?page=encyclopedia&entry=season%3Awinter&bg=winter' }, null))
      .toBe('/open-agricola/?page=encyclopedia&bg=winter')
  })
})
