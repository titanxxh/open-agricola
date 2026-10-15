import { ensureCatalogLookupsInstalled } from '../install-catalog-lookups'
import { guardCardImplListeners } from './listener-purity-guard'

ensureCatalogLookupsInstalled()

const { ALL_CARD_IMPLS } = await import('../register-all')

// Direct `impl.listeners[i].handler(ctx)` calls in focused tests bypass
// executeCardListener, so guard the registered functions themselves.
guardCardImplListeners(ALL_CARD_IMPLS)

