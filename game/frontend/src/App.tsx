import { useEffect, useState } from 'react'
import './App.css'

type HelloResponse = {
  message: string
}

function App() {
  const [message, setMessage] = useState('Loading…')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/hello', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`)
        return response.json() as Promise<HelloResponse>
      })
      .then((data) => setMessage(data.message))
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'Request failed')
      })

    return () => controller.abort()
  }, [])

  return <main>{error ? `Error: ${error}` : message}</main>
}

export default App
