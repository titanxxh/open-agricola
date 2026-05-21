import { describe, expect, it } from 'vitest'
import { LESSONS_SPACE_IDS, isLessonsSpaceId } from '../helpers/lessons-spaces'

describe('lessons-spaces helper', () => {
  it('contains the real lessons action-space ids', () => {
    expect(LESSONS_SPACE_IDS).toEqual(['lessons', 'lessons-3', 'lessons-4'])
  })

  it('matches real lessons spaces and rejects stale ids', () => {
    expect(isLessonsSpaceId('lessons')).toBe(true)
    expect(isLessonsSpaceId('lessons-3')).toBe(true)
    expect(isLessonsSpaceId('lessons-4')).toBe(true)
    expect(isLessonsSpaceId('lessons-2')).toBe(false)
    expect(isLessonsSpaceId('day-laborer')).toBe(false)
    expect(isLessonsSpaceId(undefined)).toBe(false)
    expect(isLessonsSpaceId(null)).toBe(false)
  })
})
