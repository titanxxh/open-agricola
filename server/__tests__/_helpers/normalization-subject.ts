export function normalizationSubject<Args extends unknown[], Result>(
  subject: (...args: Args) => Result,
  ...args: Args
): Result {
  return subject(...args)
}
