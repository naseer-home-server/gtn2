import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient } from '../lib/query-client'
import { trpc } from '../trpc'

export function useAdminSettings() {
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => trpc.admin.settings.query() })
  const update = useMutation({
    mutationFn: (enabled: boolean) => trpc.admin.setEmailLoginEnabled.mutate({ enabled }),
    onSuccess: (value) => {
      queryClient.setQueryData(['admin', 'settings'], value)
      queryClient.setQueryData(['auth', 'settings'], value)
    },
  })
  return { settings, update }
}
