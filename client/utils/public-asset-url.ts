export const publicAssetUrl = (path: string): string => {
  if (!path.startsWith('/assets/') && !path.startsWith('assets/')) return path
  const relative = path.startsWith('/') ? path.slice(1) : path
  const base = import.meta.env.BASE_URL || '/'
  return base === '/' ? `/${relative}` : `${base.replace(/\/+$/, '')}/${relative}`
}
