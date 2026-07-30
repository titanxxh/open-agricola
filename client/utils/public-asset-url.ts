export const publicAssetUrl = (path: string): string => {
  if (!path.startsWith('/assets/') && !path.startsWith('assets/')) return path
  const relative = path.startsWith('/') ? path.slice(1) : path
  const base = `${
    (import.meta.env.VITE_PUBLIC_ASSET_BASE_URL || import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
  }/`
  const version = import.meta.env.VITE_PUBLIC_ASSET_VERSION
  return `${base}${relative}${version ? `?v=${encodeURIComponent(version)}` : ''}`
}
