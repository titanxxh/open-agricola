import { describe, expect, it } from 'vitest'
import { cardTextIconTokens } from '../../projections/card-text-icons'
import { SCAN_BACKS, SCAN_CARDS, getScanCard, isScanSkin, scanFaceAssets } from '../index'

const layoutCount = (layout: string) => SCAN_CARDS.filter((card) => card.layout === layout).length

const strings = (value: unknown): string[] =>
  typeof value === 'string' ? [value]
    : Array.isArray(value) ? value.flatMap(strings)
      : value && typeof value === 'object' ? Object.values(value).flatMap(strings)
        : []

describe('scan card display catalog', () => {
  it('keeps grouped faces and backs apart', () => {
    expect(SCAN_CARDS).toHaveLength(98)
    expect(SCAN_BACKS).toHaveLength(5)
    expect(new Set(SCAN_CARDS.map((card) => card.id)).size).toBe(SCAN_CARDS.length)
    for (const back of SCAN_BACKS) expect(SCAN_CARDS.some((card) => card.art === back.art)).toBe(false)
  })

  it('counts reused skins and shared composition groups', () => {
    expect(layoutCount('occupation')).toBe(24)
    expect(layoutCount('minor')).toBe(13)
    expect(layoutCount('major')).toBe(4)
    expect(layoutCount('alien-artifact')).toBe(6)
    expect(layoutCount('illustrated-action')).toBe(8)
    expect(layoutCount('space-merchant')).toBe(3)
    expect(layoutCount('alien-event')).toBe(10)
    expect(layoutCount('event')).toBe(13)
    expect(layoutCount('landscape-event')).toBe(4)
    expect(layoutCount('offspring')).toBe(5)
    expect(layoutCount('guest')).toBe(6)
    expect(layoutCount('crop-circles')).toBe(1)
    expect(layoutCount('expansion-rules')).toBe(1)
  })

  it('keeps resources the scans print as words in words', () => {
    // Printed diagrams are art layers, so no scan text needs an inline icon token.
    const tokens = SCAN_CARDS.flatMap((card) =>
      strings(card).flatMap((text) => cardTextIconTokens(text).map((token) => `${card.id}: <${token}>`)))
    expect(tokens).toEqual([])
  })

  it('keeps scan text in the body weight like the A–E cards', () => {
    expect(SCAN_CARDS.filter((card) => strings(card).some((text) => text.includes('**'))).map((card) => card.id)).toEqual([])
  })

  it('aligns expansion directories, ids and deck marks', () => {
    const bean = getScanCard('L001_BeanFarmer')
    const ley = getScanCard('X07_LeyLines')
    const knight = getScanCard('FE15_TheNobleKnight')
    const story = getScanCard('FE01_TheLadyOfTheLakePt1')
    expect(bean && isScanSkin(bean) && bean).toMatchObject({
      deck: 'L',
      number: 'L001',
      art: '/assets/l-deck/occupation/L001.png',
      frame: '/assets/revised/card_frames.jpg',
    })
    expect(ley).toMatchObject({
      layout: 'alien-artifact',
      art: '/assets/x-deck/minor/X07.png',
      frame: '/assets/revised/card_frames.jpg',
    })
    expect(SCAN_CARDS.filter((card) => card.layout === 'minor').some((card) => card.id.startsWith('X'))).toBe(false)
    expect(knight && isScanSkin(knight) && knight).toMatchObject({
      deck: 'legendairy-forest',
      number: '15',
      art: '/assets/legendairy-forest/occupation/FE15.png',
    })
    expect(knight && isScanSkin(knight) && knight.number).not.toMatch(/[A-Z]/)
    expect(story?.art).toBe('/assets/legendairy-forest/story/FE01.png')
    expect(scanFaceAssets(bean!)).toEqual([
      '/assets/l-deck/occupation/L001.png',
      '/assets/revised/card_frames.jpg',
      '/assets/l-deck/badges/deck.png',
    ])
    for (const [id, art] of [
      ['X08_StrangeAlienEnergy', '/assets/x-deck/icons/X08-tanks.png'],
      ['X09_AlienFarmhand', '/assets/x-deck/icons/X09-broom.png'],
      ['X12_FurryFriends', '/assets/x-deck/icons/X12-woozles.png'],
      ['X17_CandyTrail', '/assets/x-deck/icons/X17-candy.png'],
    ] as const) {
      expect(scanFaceAssets(getScanCard(id)!)).toContain(art)
    }
    expect(getScanCard('X23_CropCircles')).toMatchObject({
      layout: 'crop-circles',
      art: '/assets/x-deck/crop-circles/X23.png',
      frame: '/assets/revised/action_frame.png',
    })
    expect(getScanCard('guest_Rabbit')).toMatchObject({
      group: 'newdale',
      art: '/assets/newdale/guest/Rabbit.png',
      frame: '/assets/newdale/frames/guest-scroll.png',
    })
    expect(getScanCard('guest_Gunda')?.frame).toBe('/assets/newdale/frames/guest-scroll.png')
    expect(getScanCard('FE21_TheRoadNotTaken')?.art).toBe('/assets/legendairy-forest/action/FE21.jpg')
    expect(getScanCard('newdale_rules')?.layout).toBe('expansion-rules')
    expect(SCAN_CARDS.some((card) => card.id.includes('changelings') && card.layout === 'expansion-rules')).toBe(false)
  })
})
