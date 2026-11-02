// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { unseenWhatsNewVersions } from '../whats-new'

const releases = ['v5', 'v4', 'v3'].map(version => ({ version, date: '2026-11-02', items: [{ en: version }] }))

describe('unseenWhatsNewVersions', () => {
  it('marks releases listed above the last one read', () => {
    expect([...unseenWhatsNewVersions(releases, 'v4')]).toEqual(['v5'])
    expect([...unseenWhatsNewVersions(releases, 'v5')]).toEqual([])
  })

  it('marks only the newest release on a first visit', () => {
    expect([...unseenWhatsNewVersions(releases, null)]).toEqual(['v5'])
  })

  it('marks every listed release once the last one read has aged out of the list', () => {
    expect([...unseenWhatsNewVersions(releases, 'v1')]).toEqual(['v5', 'v4', 'v3'])
  })

  it('marks nothing without releases', () => {
    expect([...unseenWhatsNewVersions([], null)]).toEqual([])
  })
})
