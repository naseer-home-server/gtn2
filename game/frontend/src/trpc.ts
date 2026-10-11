import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from 'backend/router'

export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({
    url: '/trpc',
    fetch(url, options) { return fetch(url, { ...options, credentials: 'include' }) },
  })],
})
