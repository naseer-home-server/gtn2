import { useCallback, useEffect, useState } from 'react'
const localEvent = 'gtn-stage-storage'
function readStored<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback } catch { return fallback }
}
/** Public stage drafts and clocks share a browser origin; no account/earnings data goes here. */
export function useStageStorage<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback))
  useEffect(() => {
    const sync = () => setValue(readStored(key, fallback))
    sync()
    function storage(event: StorageEvent) { if (event.key === key || event.key === null) sync() }
    function local(event: Event) { if ((event as CustomEvent<string>).detail === key) sync() }
    window.addEventListener('storage', storage)
    window.addEventListener(localEvent, local)
    return () => { window.removeEventListener('storage', storage); window.removeEventListener(localEvent, local) }
  }, [key, fallback])
  const update = useCallback((next: T) => {
    setValue(next)
    try { localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new CustomEvent(localEvent, { detail: key })) } catch { /* This tab still works when browser storage is unavailable. */ }
  }, [key])
  return [value, update] as const
}
