/**
 * Client entry point.
 *
 * TanStack Start's default auto-generated client entry emits literal
 * React.createElement(...) calls assuming React is a global. After
 * Vite production minification the namespace import gets renamed to
 * something short (e.g. C), leaving the bare 'React.createElement'
 * references broken → 'React is not defined' in the console and the
 * app never hydrates.
 *
 * Providing an explicit entry with plain JSX uses the automatic JSX
 * runtime (jsx/jsxs, no React global needed), so the bug goes away.
 */
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'

// StartClient() is prop-less — it loads our getRouter() via the
// tanstack-start runtime (hydrateStart internally).
hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
)
