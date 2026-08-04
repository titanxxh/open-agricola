// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  buildWorkshopCardUrl,
  buildWorkshopUrl,
  getWorkshopCardIdFromSearch,
  getWorkshopPrActionState,
  getWorkshopViewFromSearch,
  hasZhLocale,
} from '../../WorkshopPage'

describe('WorkshopPage card detail routing', () => {
  it('adds the selected workshop card id to the page URL', () => {
    const url = buildWorkshopCardUrl('/open-agricola/', '?page=workshop&sort=recent', 'card-db-1')

    expect(url).toBe('/open-agricola/?page=workshop&sort=recent&card=card-db-1')
  })

  it('removes the selected workshop card id when returning to the workshop list', () => {
    const url = buildWorkshopCardUrl('/open-agricola/', '?page=workshop&card=card-db-1', null)

    expect(url).toBe('/open-agricola/?page=workshop')
  })

  it('reads the selected workshop card id from the URL', () => {
    expect(getWorkshopCardIdFromSearch('?page=workshop&card=card-db-1')).toBe('card-db-1')
    expect(getWorkshopCardIdFromSearch('?page=workshop')).toBeNull()
  })
})

describe('WorkshopPage view routing', () => {
  it('writes the sandbox view into the URL', () => {
    const url = buildWorkshopUrl('/open-agricola/', '?page=workshop', { view: 'sandbox' })
    expect(url).toBe('/open-agricola/?page=workshop&view=sandbox')
  })

  it('writes the editor view into the URL', () => {
    const url = buildWorkshopUrl('/open-agricola/', '?page=workshop', { view: 'editor' })
    expect(url).toBe('/open-agricola/?page=workshop&view=editor')
  })

  it('clears the view query parameter when switching back to home', () => {
    const url = buildWorkshopUrl('/open-agricola/', '?page=workshop&view=sandbox', { view: null })
    expect(url).toBe('/open-agricola/?page=workshop')
  })

  it('replaces an existing view value rather than appending', () => {
    const url = buildWorkshopUrl('/open-agricola/', '?page=workshop&view=sandbox', { view: 'editor' })
    expect(url).toBe('/open-agricola/?page=workshop&view=editor')
  })

  it('preserves unrelated query parameters', () => {
    const url = buildWorkshopUrl('/open-agricola/', '?page=workshop&sort=recent', { view: 'sandbox' })
    expect(url).toBe('/open-agricola/?page=workshop&sort=recent&view=sandbox')
  })

  it('clears the card parameter when entering a non-detail view', () => {
    const url = buildWorkshopUrl(
      '/open-agricola/',
      '?page=workshop&card=card-db-1',
      { view: 'sandbox', card: null },
    )
    expect(url).toBe('/open-agricola/?page=workshop&view=sandbox')
  })

  it('reads the view from the URL when present', () => {
    expect(getWorkshopViewFromSearch('?page=workshop&view=sandbox')).toBe('sandbox')
    expect(getWorkshopViewFromSearch('?page=workshop&view=editor')).toBe('editor')
  })

  it('returns null when no recognised view is in the URL', () => {
    expect(getWorkshopViewFromSearch('?page=workshop')).toBeNull()
    expect(getWorkshopViewFromSearch('?page=workshop&view=detail')).toBeNull()
    expect(getWorkshopViewFromSearch('?page=workshop&view=home')).toBeNull()
  })
})

describe('WorkshopPage PR action state', () => {
  it('keeps the PR area visible for the author before publishing', () => {
    const state = getWorkshopPrActionState({
      enabled: true,
      isAuthor: true,
      reviewStatus: 'unsubmitted',
      githubPrUrl: null,
      githubPrStatus: null,
    })

    expect(state.visible).toBe(true)
    expect(state.disabled).toBe(false)
    expect(state.buttonLabel).toBe('提交审核（发起 PR）')
  })

  it('allows unsubmitted author cards to start review', () => {
    const state = getWorkshopPrActionState({
      enabled: true,
      isAuthor: true,
      reviewStatus: 'unsubmitted',
      githubPrUrl: null,
      githubPrStatus: null,
      localesComplete: true,
    })

    expect(state.visible).toBe(true)
    expect(state.disabled).toBe(false)
    expect(state.buttonLabel).toBe('提交审核（发起 PR）')
  })

  it('blocks PR submission when zh locale is missing', () => {
    const state = getWorkshopPrActionState({
      enabled: true,
      isAuthor: true,
      reviewStatus: 'unsubmitted',
      githubPrUrl: null,
      githubPrStatus: null,
      localesComplete: false,
    })

    expect(state.visible).toBe(true)
    expect(state.disabled).toBe(true)
    expect(state.buttonLabel).toBe('请先完成中文本地化')
    expect(state.secondary).toMatch(/本地化/)
  })

  it('blocks PR submission until the published version passes the sandbox gate', () => {
    const state = getWorkshopPrActionState({
      enabled: true,
      isAuthor: true,
      reviewStatus: 'unsubmitted',
      handoffReady: false,
      localesComplete: true,
    })

    expect(state).toMatchObject({
      visible: true,
      disabled: true,
      buttonLabel: '先完成当前版本沙盒确认',
    })
  })

  it('locks the action when the PR merged before review sync catches up', () => {
    const state = getWorkshopPrActionState({
      enabled: true,
      isAuthor: true,
      reviewStatus: 'in_review',
      githubPrUrl: 'https://github.com/x/y/pull/7',
      githubPrStatus: 'merged',
      localesComplete: true,
    })

    expect(state.disabled).toBe(true)
    expect(state.buttonLabel).toBe('已合并 ✓')
  })

  it('explains that resubmitting after closure creates a new PR', () => {
    const state = getWorkshopPrActionState({
      enabled: true,
      isAuthor: true,
      reviewStatus: 'in_review',
      githubPrUrl: 'https://github.com/x/y/pull/7',
      githubPrStatus: 'closed',
      localesComplete: true,
    })

    expect(state.disabled).toBe(false)
    expect(state.buttonLabel).toBe('重新提交审核')
    expect(state.secondary).toBe('上次 PR #7 已关闭 · 将创建新的审核 PR')
  })

  it('treats omitted localesComplete as legacy (allowed) for back-compat', () => {
    const state = getWorkshopPrActionState({
      enabled: true,
      isAuthor: true,
      reviewStatus: 'unsubmitted',
      githubPrUrl: null,
      githubPrStatus: null,
    })

    expect(state.disabled).toBe(false)
  })
})

describe('hasZhLocale', () => {
  it('accepts a complete zh entry', () => {
    expect(hasZhLocale({
      locales: { zh: { name: '名字', desc: ['描述'] } },
    })).toBe(true)
  })

  it('rejects when locales is absent', () => {
    expect(hasZhLocale({})).toBe(false)
    expect(hasZhLocale(null)).toBe(false)
    expect(hasZhLocale(undefined)).toBe(false)
  })

  it('rejects when zh is missing', () => {
    expect(hasZhLocale({ locales: { en: { name: 'name', desc: ['d'] } } })).toBe(false)
  })

  it('rejects when zh.name is empty', () => {
    expect(hasZhLocale({ locales: { zh: { name: '   ', desc: ['描述'] } } })).toBe(false)
  })

  it('rejects when zh.desc is empty or whitespace-only', () => {
    expect(hasZhLocale({ locales: { zh: { name: '名字', desc: [] } } })).toBe(false)
    expect(hasZhLocale({ locales: { zh: { name: '名字', desc: ['  '] } } })).toBe(false)
  })
})
