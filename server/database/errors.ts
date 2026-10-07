/** PostgreSQL constraint identity is stable across server message locales. */
export function isUniqueViolation(error: unknown, ...constraints: string[]): boolean {
  return error instanceof Error
    && 'code' in error && error.code === '23505'
    && 'constraint' in error && typeof error.constraint === 'string'
    && constraints.includes(error.constraint)
}

export class WorkshopSubmissionInProgressError extends Error {
  constructor() { super('Recover the pending Workshop submission before deleting') }
}

export function isWorkshopSubmissionInProgress(error: unknown): boolean {
  return error instanceof WorkshopSubmissionInProgressError
    || error instanceof Error && 'code' in error && error.code === '23514'
      && 'constraint' in error && error.constraint === 'workshop_submission_in_progress'
}
