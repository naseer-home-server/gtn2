import { useSearchParams } from 'react-router-dom'
import { presentationSlideIndex, presentationSlides } from './slides'

function boundedStep(value: number, index: number) {
  return Number.isSafeInteger(value) ? Math.max(0, Math.min(value, presentationSlides[index].steps.length - 1)) : 0
}

/** Slide and reveal position live in the URL, so refreshes and new TV tabs keep their place. */
export function usePresentationSlide() {
  const [params, setParams] = useSearchParams()
  const index = presentationSlideIndex(params.get('slide'))
  const slide = presentationSlides[index]
  const step = boundedStep(Number(params.get('step') ?? '1') - 1, index)
  function selectSlide(next: number, nextStep = 0) {
    const bounded = Math.max(0, Math.min(next, presentationSlides.length - 1))
    const reveal = boundedStep(nextStep, bounded)
    const updated = new URLSearchParams(params)
    if (bounded === 0) updated.delete('slide')
    else updated.set('slide', presentationSlides[bounded].id)
    if (reveal === 0) updated.delete('step')
    else updated.set('step', String(reveal + 1))
    setParams(updated, { replace: true })
  }
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
