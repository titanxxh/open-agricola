export function authErrorMessage(
  code: string | undefined,
  fallback: string | undefined,
  t: (key: string) => string,
): string {
  if (code) {
    const key = `platform.authErrors.${code}`
    const localized = t(key)
    if (localized !== key) return localized
  }
  return fallback || t('platform.unknownError')
}
