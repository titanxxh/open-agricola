import { API_BASE } from '../config'

import { readReplayViewerManifest, supportsReplayBridge } from '../../shared/contract/replay-viewer-build'
import { isPrereleaseClient } from '../services/prerelease-runtime'

const sha256 = async (bytes: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')
}

const responseHash = async (
  response: Response,
  bytes: ArrayBuffer,
): Promise<string> =>
  crypto.subtle
    ? sha256(bytes)
    : response.headers.get('etag')?.replaceAll('"', '') ?? ''

export const verifyReplayViewerBuild = async (
  viewerBuildId: string,
  signal: AbortSignal,
  schemaVersion = 1,
): Promise<void> => {
  const response = await fetch(
    `${API_BASE}/replay-viewers/${viewerBuildId}/manifest.json`,
    { credentials: 'omit', signal },
  )
  const bytes = await response.arrayBuffer()
  const manifest = readReplayViewerManifest(JSON.parse(new TextDecoder().decode(bytes)))
  if (
    !response.ok
    || await responseHash(response, bytes) !== viewerBuildId
    || !manifest
    || isPrereleaseClient() && !supportsReplayBridge(manifest, schemaVersion)
  ) throw new Error('viewer_manifest_mismatch')
}
