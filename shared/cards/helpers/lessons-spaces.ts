export const LESSONS_SPACE_IDS = ['lessons', 'lessons-3', 'lessons-4', 'lessons-56-2f', 'lessons-56-variable'] as const

export type LessonsSpaceId = typeof LESSONS_SPACE_IDS[number]

const LESSONS_SPACE_ID_SET = new Set<string>(LESSONS_SPACE_IDS)

export const isLessonsSpaceId = (
  spaceId: string | null | undefined,
): spaceId is LessonsSpaceId => !!spaceId && LESSONS_SPACE_ID_SET.has(spaceId)
