// Type-only re-export of AppRouter for the web client. Importing this
// instead of './root' directly keeps the type surface minimal and avoids
// accidentally dragging server-side imports into the web bundle.
export type { AppRouter } from './root'
