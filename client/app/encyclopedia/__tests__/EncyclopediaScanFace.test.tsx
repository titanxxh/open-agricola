// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { EncyclopediaEntry } from '../../../../shared/contract/card-encyclopedia'
import { getScanCard } from '../../../../shared/scan-cards'
import { EncyclopediaFace } from '../EncyclopediaFace'
import { itemFor, stubImages } from './fixtures'

vi.stubGlobal('Image', stubImages(() => 'load'))

const faceFor = (id: string): EncyclopediaEntry => {
  const card = getScanCard(id)
  if (!card) throw new Error(id)
  return {
    key: `scan:${id}`,
    sourceKind: 'scan',
    sourceId: id,
    group: card.group,
    publicType: card.layout === 'alien-artifact'
      ? 'alienArtifact'
      : card.layout === 'occupation' || card.layout === 'minor' || card.layout === 'major'
        ? card.layout
        : 'illustratedAction',
    displayNumber: 'number' in card ? card.number : null,
    players: null,
    face: { kind: 'scan', cardId: id },
    text: { name: [{ literal: card.name }], body: card.text ? [{ literal: card.text }] : undefined },
    cost: { kind: 'notApplicable' },
    score: { fixed: null, extraVp: false },
  }
}

const renderFace = (id: string) => render(<EncyclopediaFace item={itemFor(faceFor(id))} locale="en" />)

describe('encyclopedia scan card faces', () => {
  it('reuses the player card for L and tree skins', () => {
    const { container, unmount } = renderFace('L001_BeanFarmer')
    const skin = container.querySelector('.player-card.occupation')
    expect(skin?.querySelector('[data-scan-deck="L"]')?.getAttribute('data-numbering')).toBe('L001')
    expect(skin?.querySelector('.card-deck')?.getAttribute('data-deck')).toBe('L')
    expect(screen.getByText('Bean Farmer')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    unmount()

    const tree = renderFace('FE15_TheNobleKnight')
    expect(tree.container.querySelector('[data-scan-deck="legendairy-forest"]')?.getAttribute('data-numbering')).toBe('15')
    expect(tree.container.querySelector('.card-deck')?.getAttribute('data-deck')).toBe('legendairy-forest')
    expect(tree.container.textContent).not.toContain('tree15')
    tree.unmount()

    const bear = renderFace('L089_Bear')
    expect(bear.container.querySelector('.player-card.major [data-scan-deck="L"]')).not.toBeNull()
  })

  it('draws the alien artifacts on their own green frame instead of the minor card', () => {
    const ley = renderFace('X07_LeyLines')
    expect(ley.container.querySelector('.player-card')).toBeNull()
    expect(ley.getByRole('group', { name: 'Ley Lines' })).toHaveAttribute('data-layout', 'alien-artifact')
    expect(ley.container.querySelectorAll('.scan-artifact__sprigs image')).toHaveLength(2)
    expect(ley.container.querySelector('.scan-artifact__bonus')).not.toBeNull()
    ley.unmount()

    const replicator = renderFace('X10_Replicator')
    expect(replicator.container.querySelector('.scan-artifact__sprigs')).toBeNull()
    replicator.unmount()

    const energy = renderFace('X08_StrangeAlienEnergy')
    expect(energy.container.querySelector('.card-score')).toHaveAttribute('data-negative', 'true')
    energy.unmount()

    const furry = renderFace('X12_FurryFriends')
    expect(furry.container.querySelector('.scan-stack-over')).not.toBeNull()
  })

  it.each([
    ['X01_ExtraterrestrialExcrement', 'X01.jpg', 'overlay-X01.png'],
    ['X02_HomemadeSpaceRocket', 'X02.jpg', 'overlay-X02.png'],
    ['X03_Transmogrifier', 'X03.jpg', 'overlay-X03.png'],
  ])('closes the %s action panel above its full-bleed art', (id, art, overlay) => {
    const { container } = renderFace(id)
    const face = container.querySelector('.scan-illustrated')
    expect(face?.querySelectorAll('.scan-illustrated__frame image')).toHaveLength(6)
    expect(face?.querySelector('.scan-bottom-art')?.getAttribute('src')).toContain(`/assets/x-deck/action/${art}`)
    expect(face?.querySelector('.scan-stack-over')?.getAttribute('src')).toContain(overlay)
  })

  it('closes the Forest action panels and lays the parchment through the frame masks', () => {
    const fe18 = renderFace('FE18_WarriorPrincess')
    const face = fe18.container.querySelector('.scan-illustrated[data-deck="legendairy-forest"]')
    const hrefs = [...(face?.querySelectorAll('.scan-illustrated__frame image') ?? [])].map((image) => image.getAttribute('href') ?? '')
    expect(hrefs.some((href) => href.includes('action_frame_panel.png'))).toBe(true)
    expect(hrefs.some((href) => href.includes('action_frame_title.png'))).toBe(true)
    expect(face?.querySelector('.scan-forest-tree')).not.toBeNull()
    expect(face?.querySelector('.scan-stack-over')?.getAttribute('src')).toContain('overlay-FE18.png')
  })

  it('builds the guests and the rules card from frame parts', () => {
    const gunda = renderFace('guest_Gunda')
    expect(gunda.container.querySelector('.scan-guest__face')).not.toBeNull()
    expect(gunda.container.querySelector('img')).toBeNull()
    gunda.unmount()

    const rules = renderFace('newdale_rules')
    expect(rules.container.querySelector('.scan-rules__parchment image')?.getAttribute('href')).toContain('/assets/changelings/frames/parchment.jpg')
    expect(rules.container.querySelector('.scan-rules')?.getAttribute('style')).toBeNull()
  })

  it.each([
    ['X03_Transmogrifier', 'illustrated-action', 'Transmogrifier'],
    ['X06_MerchantsOfPluto', 'space-merchant', 'Merchants of Pluto'],
    ['X13_SpaceDinerAtTheEndOfTheGalaxy', 'alien-event', 'Space Diner at the End of the Galaxy'],
    ['FE01_TheLadyOfTheLakePt1', 'event', 'The Lady of the Lake, Pt. 1'],
    ['LE03_WanderingCarpenters', 'landscape-event', 'Wandering Carpenters'],
    ['WB03_CaveGoblin', 'offspring', 'Cave Goblin'],
  ])('draws %s with the %s face instead of a pasted scan', (id, layout, title) => {
    const { container } = renderFace(id)
    expect(screen.getByRole('group', { name: title })).toHaveAttribute('data-layout', layout)
    expect(container.querySelector('.player-card')).toBeNull()
    const images = [...container.querySelectorAll('img')].map((image) => image.getAttribute('src') ?? '')
    expect(images.every((src) => src === '' || src.includes('/assets/'))).toBe(true)
    expect(images.some((src) => src.endsWith('.pdf') || src.includes('Downloads'))).toBe(false)
    expect(container.querySelector('.scan-copy, .scan-event-body')).not.toBeNull()
  })

  it('draws the Broch scoring chart with the A–E resource icons', () => {
    const { container } = renderFace('L062_Broch')
    const chart = container.querySelector('.scan-text')
    expect(chart?.textContent).toContain('Scoring:')
    expect(chart?.textContent).toContain('2')
    expect(chart?.textContent).toContain('6')
    expect(chart?.querySelectorAll('.res-icon-stone')).toHaveLength(3)
    expect(chart?.querySelectorAll('.res-icon-score')).toHaveLength(3)
    expect(chart?.querySelector('.res-icon-arrow-1x')).not.toBeNull()
    expect(chart?.querySelector('.res-icon-score')).not.toBeNull()
    expect(container.querySelector('img[src*="L062-scoring"]')).toBeNull()
  })

  it('prints the event footer and the story score table', () => {
    const event = renderFace('LE01_PetLovers')
    expect(event.container.querySelector('.scan-event')).not.toBeNull()
    expect(event.getByText(/select an event card/)).toBeInTheDocument()
    event.unmount()
    const story = renderFace('FE26_PeruvianInquisition')
    expect(story.container.querySelectorAll('.scan-score-table li')).toHaveLength(5)
    expect(story.container.querySelectorAll('.res-icon-score')).toHaveLength(5)
    expect(story.container.querySelectorAll('.res-icon-llama')).toHaveLength(5)
    expect(story.getByText('Nobody expects the Peruvian Inquisition.')).toBeInTheDocument()
    expect(story.getByText(/llamas score as follows for all players/)).toBeInTheDocument()
  })
})
