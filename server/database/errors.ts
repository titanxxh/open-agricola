/** PostgreSQL constraint identity is stable across server message locales. */
export function isUniqueViolation(error: unknown, ...constraints: string[]): boolean {
  return error instanceof Error
    && 'code' in error && error.code === '23505'
    && 'constraint' in error && typeof error.constraint === 'string'
    && constraints.includes(error.constraint)
}
