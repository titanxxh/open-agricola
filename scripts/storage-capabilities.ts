/**
 * Storage features this image supports, probed by the release controller
 * before choosing a cutover. An image without this module supports none.
 * - directory-database: exports an uncompressed directory-format dump (archive version 2).
 * - counted-live-check: `check-live --counted` validates live data structurally,
 *   relying on an Owner-local Validation of the same bytes for frame content.
 */
export const STORAGE_CAPABILITIES = ['directory-database', 'counted-live-check'] as const
