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

  it('renders Farmers of the Moor resource placeholders as sprites', () => {
    const { container } = render(<ResourceText text="<HORSE> <FUEL>" />)
    expect(container.querySelector('.res-icon-horse')).toBeTruthy()
    expect(container.querySelector('.res-icon-fuel')).toBeTruthy()
    expect(container.textContent).not.toContain('<HORSE>')
    expect(container.textContent).not.toContain('<FUEL>')
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

  it('renders <ARROW> as res-icon-arrow sprite (not literal text)', () => {
    const { container } = render(<ResourceText text="<GRAIN> <ARROW> 2<FOOD>" />)
    expect(container.querySelector('.res-icon-arrow')).toBeTruthy()
    expect(container.textContent).not.toContain('<ARROW>')
  })

  it('renders <ARROW-1X> and <ARROW-2X> variants (hyphen-aware regex)', () => {
    const one = render(<ResourceText text="<CLAY> <ARROW-1X> 2<FOOD>" />)
    expect(one.container.querySelector('.res-icon-arrow-1x')).toBeTruthy()
    expect(one.container.textContent).not.toContain('<ARROW-1X>')

    const two = render(<ResourceText text="<GRAIN> <ARROW-2X> 5<FOOD>" />)
    expect(two.container.querySelector('.res-icon-arrow-2x')).toBeTruthy()
    expect(two.container.textContent).not.toContain('<ARROW-2X>')
  })

  it('renders <BAKE>, <FIELD>, <FENCE>, <GRAIN_VEG_STACK> as sprites', () => {
    const { container } = render(
      <ResourceText text="<BAKE> <FIELD> <FENCE> <GRAIN_VEG_STACK>" />,
    )
    expect(container.querySelector('.res-icon-bake')).toBeTruthy()
    expect(container.querySelector('.res-icon-field')).toBeTruthy()
    expect(container.querySelector('.res-icon-fence-icon')).toBeTruthy()
    expect(container.querySelector('.res-icon-grain-veg-stack')).toBeTruthy()
  })

  it('strips [text] brackets and wraps the inner content in card-desc-label', () => {
    const { container } = render(<ResourceText text="[Anytime]" />)
    const label = container.querySelector('.card-desc-label')
    expect(label).toBeTruthy()
    expect(label!.textContent).toBe('Anytime')
    expect(container.textContent).not.toContain('[')
    expect(container.textContent).not.toContain(']')
  })

  it('strips __text__ markers and wraps the inner content in card-desc-em', () => {
    const { container } = render(<ResourceText text="get __1 wood__ now" />)
    const em = container.querySelector('em.card-desc-em')
    expect(em).toBeTruthy()
    expect(em!.textContent).toBe('1 wood')
    expect(container.textContent).not.toContain('__')
  })

  it('parses nested [__Bake Bread__ action:] into label-with-em', () => {
    const { container } = render(<ResourceText text="[__Bake Bread__ action:]" />)
    const label = container.querySelector('.card-desc-label')
    expect(label).toBeTruthy()
    const em = label!.querySelector('em.card-desc-em')
    expect(em).toBeTruthy()
    expect(em!.textContent).toBe('Bake Bread')
    // The trailing " action:" stays inside the label as plain text.
    expect(label!.textContent).toBe('Bake Bread action:')
    expect(container.textContent).not.toContain('[')
    expect(container.textContent).not.toContain('__')
  })

  it('icon placeholders inside [..] still render as sprites', () => {
    const { container } = render(<ResourceText text="[<GRAIN> <ARROW> 2<FOOD>]" />)
    const label = container.querySelector('.card-desc-label')
    expect(label).toBeTruthy()
    expect(label!.querySelector('.res-icon-grain')).toBeTruthy()
    expect(label!.querySelector('.res-icon-arrow')).toBeTruthy()
    expect(label!.querySelector('.res-icon-food')).toBeTruthy()
  })
})
