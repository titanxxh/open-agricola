// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EncyclopediaFace } from '../EncyclopediaFace'
import { cardEntry, COOKING_HEARTH, itemFor, parentEntry, stubImages, WINTER } from './fixtures'

const broken = new Set<string>()
vi.stubGlobal('Image', stubImages(url => ([...broken].some(part => url.includes(part)) ? 'error' : 'load')))
afterEach(() => broken.clear())

const settleImages = () => act(async () => { await Promise.resolve() })

describe('encyclopedia card faces', () => {
  it('shows the printed card face when its art loads', async () => {
    const { container } = render(<EncyclopediaFace item={itemFor(cardEntry('A006_StorageBarn', 'A006'))} locale="en" />)
    await settleImages()

    expect(container.querySelector('.player-card [data-id="A006_StorageBarn"]')).not.toBeNull()
    expect(screen.queryByText('Image unavailable')).toBeNull()
  })

  it('keeps the name, number and card text on a text face when a card image fails', async () => {
    broken.add('/deckA/A005')
    const { container } = render(<EncyclopediaFace item={itemFor(cardEntry('A005_ClayEmbankment', 'A005'))} locale="en" />)

    expect(await screen.findByText('Image unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Clay Embankment' })).toBeInTheDocument()
    expect(screen.getByText('A005')).toBeInTheDocument()
    expect(container.textContent).toContain('for every 2')
    expect(container.querySelector('.player-card')).toBeNull()
  })

  it('falls back from the major improvement icon sheet as well', async () => {
    broken.add('/majors_icons.jpg')
    render(<EncyclopediaFace item={itemFor(COOKING_HEARTH)} locale="en" />)

    expect(await screen.findByText('Image unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cooking Hearth' })).toBeInTheDocument()
  })

  it('shows the parent card face when its portrait loads and a text face when it fails', async () => {
    const loaded = render(<EncyclopediaFace item={itemFor(parentEntry('PR03', 'mother', 0))} locale="en" />)
    await settleImages()
    expect(loaded.container.querySelector('.parent-card-face')).not.toBeNull()
    loaded.unmount()

    broken.add('/parents/portrait/')
    const failed = render(<EncyclopediaFace item={itemFor(parentEntry('PR02', 'mother', -0.25))} locale="en" />)

    expect(await screen.findByText('Image unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mother PR02' })).toBeInTheDocument()
    expect(failed.container.textContent).toContain('Place 1 field tile on round space 12.')
    expect(failed.container.querySelector('.parent-card-face')).toBeNull()
  })

  it('reads season rules from a text face', () => {
    const { container } = render(<EncyclopediaFace item={itemFor(WINTER)} locale="en" />)

    expect(screen.getByRole('heading', { name: 'Winter' })).toBeInTheDocument()
    expect(container.textContent).toContain('Romantic Evening · ')
    expect(screen.queryByText('Image unavailable')).toBeNull()
  })
})
