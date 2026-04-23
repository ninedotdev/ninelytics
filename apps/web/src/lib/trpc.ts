import { createTRPCReact } from '@trpc/react-query'
import type { AppRouter } from '@ninelytics/api/router-type'

export const trpc = createTRPCReact<AppRouter>()
