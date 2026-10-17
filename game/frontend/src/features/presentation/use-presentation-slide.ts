import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePresentationData } from './use-presentation-data'
import { finalStandingsSteps } from './final-standings-model'
import { presentationSlideIndex, presentationSlides } from './slides'

function boundedStep(value: number, length: number) {
  return Number.isSafeInteger(value) ? Math.max(0, Math.min(value, length - 1)) : 0
}

/** Slide and reveal position live in the URL, so refreshes and new TV tabs keep their place. */
export function usePresentationSlide({ broadcast = false, follow = false }: { broadcast?: boolean; follow?: boolean } = {}) {
  const [params, setParams] = useSearchParams()
  const index = presentationSlideIndex(params.get('slide'))
  const baseSlide = presentationSlides[index]
  const finalData = usePresentationData({ includeFinalStandings:baseSlide.id === 'final-standings' }, baseSlide.id === 'final-standings')
  const finalSteps = finalStandingsSteps(finalData.data?.teams.length || 7)
  const slide = baseSlide.id === 'final-standings' ? {...baseSlide, steps:finalSteps} : baseSlide
  const step = boundedStep(Number(params.get('step') ?? '1') - 1, slide.steps.length)
  function selectSlide(next: number, nextStep = 0) {
    const bounded = Math.max(0, Math.min(next, presentationSlides.length - 1))
    const reveal = boundedStep(nextStep, presentationSlides[bounded].id === 'final-standings' ? finalSteps.length : presentationSlides[bounded].steps.length)
    const updated = new URLSearchParams(params)
    if (bounded === 0) updated.delete('slide')
    else updated.set('slide', presentationSlides[bounded].id)
    if (reveal === 0) updated.delete('step')
    else updated.set('step', String(reveal + 1))
    setParams(updated, { replace: true })
    if (broadcast) { try { localStorage.setItem('gtn-stage-navigation', JSON.stringify({ id: presentationSlides[bounded].id, step: reveal, sentAt: Date.now() })) } catch { /* Local controls still work. */ } }
  }
  useEffect(() => {
    if (!follow) return
    const receive = (event: StorageEvent) => {
      if (event.key !== 'gtn-stage-navigation' || !event.newValue) return
      try {
        const message = JSON.parse(event.newValue) as { id: string; step: number }
        if (!presentationSlides.some(item => item.id === message.id) || !Number.isSafeInteger(message.step)) return
        const next = new URLSearchParams()
        if (message.id !== 'welcome') next.set('slide', message.id)
        if (message.step > 0) next.set('step', String(message.step + 1))
        setParams(next, { replace: true })
      } catch { /* Ignore malformed navigation messages. */ }
    }
    window.addEventListener('storage', receive)
    return () => window.removeEventListener('storage', receive)
  }, [follow, setParams])
  function advance() {
    if (step < slide.steps.length - 1) selectSlide(index, step + 1)
    else if (index < presentationSlides.length - 1) selectSlide(index + 1)
  }
  function retreat() {
    if (step > 0) selectSlide(index, step - 1)
    else if (index > 0) selectSlide(index - 1, presentationSlides[index - 1].steps.length - 1)
  }
  return {
    index, slide, step, selectSlide, advance, retreat,
    canAdvance: step < slide.steps.length - 1 || index < presentationSlides.length - 1,
    canRetreat: step > 0 || index > 0,
  }
}
