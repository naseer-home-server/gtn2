import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
export function HomePage() {
  const auth = useAuth()
  return <Navigate to={auth.data?.isAdmin ? '/admin' : '/play'} replace />
}
