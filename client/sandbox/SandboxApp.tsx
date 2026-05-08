import { Suspense, lazy } from 'react'

const WorkshopPage = lazy(() =>
  import('../app/WorkshopPage').then(m => ({ default: m.WorkshopPage })),
)

export default function SandboxApp() {
  return (
    <Suspense fallback={<div data-testid="sandbox-loading">Loading sandbox…</div>}>
      <WorkshopPage />
    </Suspense>
  )
}
