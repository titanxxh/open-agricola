/** Workshop URLs identify managed objects, including URLs saved before an API
 * origin change. Never fetch their authority: bytes must pass ResourceStore's
 * catalog, integrity and erasure checks. Keep the SQL reference extractor in sync.
 */
export function cardArtKey(url: string | null | undefined): string | null {
  return url?.match(/^(?:https?:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?)?(?:\/(?!\.{1,2}\/)[A-Za-z0-9._~-]+)*\/(card-art\/[A-Za-z0-9._-]+\.(?:png|jpg|jpeg|webp))$/i)?.[1] ?? null
}
