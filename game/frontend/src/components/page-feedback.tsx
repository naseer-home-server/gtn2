import { Alert, AlertDescription } from '@/components/ui/alert'

export function ErrorMessage({ message }: { message: string }) {
  return <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>
}

export function LoadingMessage() {
  return <p role="status" className="py-6 text-sm text-muted-foreground">Loading…</p>
}
