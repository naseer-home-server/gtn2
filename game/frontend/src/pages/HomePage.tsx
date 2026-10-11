import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorMessage, LoadingMessage } from '@/components/page-feedback'
import { useHello } from '../hooks/use-hello'

export function HomePage() {
  const hello = useHello()
  return <div className="space-y-6">
    <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
    <Card>
      <CardHeader><CardTitle><h2>Welcome</h2></CardTitle></CardHeader>
      <CardContent>
        {hello.isPending ? <LoadingMessage /> : hello.error ? <ErrorMessage message={hello.error.message} /> : <p>{hello.data.message}</p>}
      </CardContent>
    </Card>
  </div>
}
