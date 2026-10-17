import { AlertCircle, LoaderCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
export function ErrorMessage({ message }: { message: string }) {
  return <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{message}</AlertDescription></Alert>
}
export function LoadingMessage() {
  return <p role="status" className="flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading your table…</p>
}
