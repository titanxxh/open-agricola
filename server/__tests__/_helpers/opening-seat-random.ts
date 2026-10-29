import { beforeEach, vi } from 'vitest'

const seats = vi.hoisted(() => ({ draw: vi.fn<(max: number) => number>(() => 0) }))
vi.mock('node:crypto', async original => ({ ...await original<typeof import('node:crypto')>(), randomInt: seats.draw }))
export const openingSeatRandom = seats.draw

// Transport fixtures specify their seating independently of rules/card seeds.
beforeEach(() => { openingSeatRandom.mockReset().mockReturnValue(0) })
