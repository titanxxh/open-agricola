import { API_BASE } from '../config'

type ViewerManifest = {
  entrypoint: 'index.html'
  files: Record<string, string>
}

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

const parseViewerManifest = (bytes: ArrayBuffer): ViewerManifest | null => {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Partial<ViewerManifest>
    if (
      value.entrypoint !== 'index.html'
      || !value.files
      || typeof value.files !== 'object'
      || Array.isArray(value.files)
      || !('index.html' in value.files)
      || !Object.values(value.files).every(
        (hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash),
      )
    ) return null
    return value as ViewerManifest
  } catch {
    return null
  }
}

export const verifyReplayViewerBuild = async (
  viewerBuildId: string,
  signal: AbortSignal,
): Promise<void> => {
  const response = await fetch(
    `${API_BASE}/replay-viewers/${viewerBuildId}/manifest.json`,
    { credentials: 'omit', signal },
  )
  const bytes = await response.arrayBuffer()
  if (
    !response.ok
    || await responseHash(response, bytes) !== viewerBuildId
    || !parseViewerManifest(bytes)
  ) throw new Error('viewer_manifest_mismatch')
}
