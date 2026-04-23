// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Section } from '../Section'

describe('Section', () => {
  it('renders title and children', () => {
    render(<Section title="Hello"><p>Body</p></Section>)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('renders subtitle and icon', () => {
    render(
      <Section title="T" subtitle="S" icon="🎲">
        <p>x</p>
      </Section>,
    )
    expect(screen.getByText('S')).toBeInTheDocument()
    expect(screen.getByText('🎲')).toBeInTheDocument()
  })

  it('renders actions next to title', () => {
    render(
      <Section title="T" actions={<button>+ Add</button>}>
        <p>x</p>
      </Section>,
    )
    expect(screen.getByRole('button', { name: '+ Add' })).toBeInTheDocument()
  })

  it('applies parchment variant class', () => {
    const { container } = render(
      <Section title="T" variant="parchment">x</Section>,
    )
    expect(container.querySelector('.section--parchment')).toBeInTheDocument()
  })

  it('toggles collapse when collapsible', () => {
    render(
      <Section title="T" collapsible defaultCollapsed={false}>
        <p>Body</p>
      </Section>,
    )
    expect(screen.getByText('Body')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /collapse|fold|toggle/i }))
    expect(screen.queryByText('Body')).not.toBeInTheDocument()
  })

  it('renders collapsed by default when defaultCollapsed=true', () => {
    render(
      <Section title="T" collapsible defaultCollapsed>
        <p>Body</p>
      </Section>,
    )
    expect(screen.queryByText('Body')).not.toBeInTheDocument()
  })
})
