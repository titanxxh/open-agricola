// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { EncyclopediaBrowser } from '../EncyclopediaBrowser'
import { createEncyclopediaBrowseStore } from '../encyclopedia-browse-store'
import { EncyclopediaTextFace } from '../EncyclopediaTextFace'
import { BASEBOARDS, cardEntry, encyclopediaOf, itemFor, stubImages } from './fixtures'

vi.stubGlobal('Image', stubImages(() => 'load'))

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const MARK = '此项暂无中文，显示英文'

const ENGLISH_ONLY = cardEntry('A005_ClayEmbankment', 'A005', {
  text: {
    name: [{ literal: 'Clay Embankment' }],
    body: [{ literal: 'You immediately get 1 clay for every 2 clay in your supply.' }],
  },
})

const navigation = { selectedKey: null, openEntry: () => {}, closeEntry: () => {} }

describe('English fallback marks', () => {
  it('marks a gallery name that is still English in the Chinese interface and leaves translated names alone', () => {
    const encyclopedia = encyclopediaOf([itemFor(ENGLISH_ONLY, { name: 'fallback', body: 'fallback' }), itemFor(BASEBOARDS)])
    render(<EncyclopediaBrowser encyclopedia={encyclopedia} navigation={navigation} locale="zh" store={createEncyclopediaBrowseStore()} />)

    const fallback = screen.getByRole('button', { name: '查看 Clay Embankment' })
    expect(fallback).toHaveAccessibleDescription(MARK)
    expect(within(fallback).getByText('Clay Embankment')).toHaveAttribute('lang', 'en')
    expect(within(fallback).getByTitle(MARK)).toBeInTheDocument()

    const translated = screen.getByRole('button', { name: '查看 护壁板' })
    expect(translated).not.toHaveAccessibleDescription()
    expect(within(translated).queryByTitle(MARK)).toBeNull()
    expect(within(translated).getByText('护壁板')).not.toHaveAttribute('lang')
  })

  it('marks the name and card text of a text face that are still English', () => {
    const { container } = render(<EncyclopediaTextFace item={itemFor(ENGLISH_ONLY, { name: 'fallback', body: 'fallback' })} locale="zh" />)

    expect(screen.getAllByRole('img', { name: MARK })).toHaveLength(2)
    expect(screen.getByText('Clay Embankment')).toHaveAttribute('lang', 'en')
    expect(container.querySelector('.encyclopedia-text-face__body [lang="en"]')).toHaveTextContent('You immediately get 1 clay for every 2 clay')
  })

  it('marks only the text face field that falls back', () => {
    const { container } = render(<EncyclopediaTextFace item={itemFor(BASEBOARDS, { body: 'fallback' })} locale="zh" />)

    expect(screen.getByRole('heading', { level: 3 })).toHaveAccessibleName('护壁板')
    expect(screen.getAllByRole('img', { name: MARK })).toHaveLength(1)
    expect(within(container.querySelector<HTMLElement>('.encyclopedia-text-face__body')!).getByRole('img', { name: MARK })).toBeInTheDocument()
  })

  it('shows no mark in English, where the same text is the original', () => {
    render(<EncyclopediaTextFace item={itemFor(ENGLISH_ONLY, { name: 'fallback', body: 'fallback' })} locale="en" />)

    expect(screen.getByRole('heading', { level: 3 })).toHaveAccessibleName('Clay Embankment')
    expect(screen.queryByRole('img', { name: 'Not translated; shown in English' })).toBeNull()
    expect(screen.getByText('Clay Embankment')).not.toHaveAttribute('lang')
  })
})
