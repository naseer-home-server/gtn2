import { useQuery } from '@tanstack/react-query'
import { trpc } from '../trpc'

export function useHello() {
  return useQuery({ queryKey: ['hello'], queryFn: () => trpc.hello.query() })
}
