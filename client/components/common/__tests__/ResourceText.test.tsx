// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ResourceText } from '../ResourceText'

describe('ResourceText', () => {
  it('renders <WOOD> as res-icon-wood (sanity)', () => {
    const { container } = render(<ResourceText text="get 1 <WOOD>" />)
    expect(container.querySelector('.res-icon-wood')).toBeTruthy()
  })

  it('renders <PIG> as res-icon-boar (PIG → boar mapping)', () => {
    const { container } = render(<ResourceText text="get 2 <PIG>" />)
    expect(container.querySelector('.res-icon-boar')).toBeTruthy()
  })

  it('renders <STABLE> as res-icon-barn', () => {
    const { container } = render(<ResourceText text="<STABLE>" />)
    expect(container.querySelector('.res-icon-barn')).toBeTruthy()
  })

  it('renders <BEGGING> as res-icon-begging', () => {
    const { container } = render(<ResourceText text="take 1 <BEGGING>" />)
    expect(container.querySelector('.res-icon-begging')).toBeTruthy()
  })

  it('renders <SCORE> as res-icon-score sprite (not ★)', () => {
    const { container } = render(<ResourceText text="gain 3 <SCORE>" />)
    expect(container.querySelector('.res-icon-score')).toBeTruthy()
    expect(container.textContent).not.toContain('★')
  })

  it('splits on \\n with <br/>', () => {
    const { container } = render(<ResourceText text={'line1\nline2'} />)
    expect(container.querySelectorAll('br')).toHaveLength(1)
  })

  it('keeps unknown <FOO> placeholders as literal text', () => {
    const { container } = render(<ResourceText text="<FOO>" />)
    expect(container.textContent).toBe('<FOO>')
  })
})
