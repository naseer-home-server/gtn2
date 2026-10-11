import { useHello } from '../hooks/use-hello'

export function HomePage() {
  const hello = useHello()
  return <>
    <h1>Game Theory Night 2</h1>
    {hello.isPending ? <p>Loading…</p> : hello.error ? <p role="alert">{hello.error.message}</p> : <p>{hello.data.message}</p>}
  </>
}
