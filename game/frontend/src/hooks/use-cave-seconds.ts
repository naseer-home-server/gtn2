import { useEffect, useState } from 'react'

export function useCaveSeconds(deadline: number | null | undefined) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (deadline == null) return
    const update = () => setNow(Date.now())
    update()
    const timer = window.setInterval(update, 250)
    document.addEventListener('visibilitychange', update)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update) }
  }, [deadline])
  return Math.max(0, Math.ceil(((deadline ?? now) - now) / 1000))
}
