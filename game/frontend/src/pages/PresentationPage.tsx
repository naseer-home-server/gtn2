import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize, Minimize } from 'lucide-react'
import { presentationSlides } from '@/features/presentation/slides'
import { usePresentationSlide } from '@/features/presentation/use-presentation-slide'
import '@/features/presentation/presentation.css'

/** This route deliberately lives outside AdminLayout: no host navigation, audit, or chats. */
export function PresentationPage() {
  const { index, slide, step, selectSlide, advance, retreat, canAdvance, canRetreat } = usePresentationSlide()
  const Slide = slide.Component
  const navigation = useRef({ selectSlide, advance, retreat })
  navigation.current = { selectSlide, advance, retreat }
  const screen = useRef<HTMLElement>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState(false)
  const wakeControls = useCallback(() => {
    setControlsVisible(true)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setControlsVisible(false), 2800)
  }, [])
  const toggleFullscreen = useCallback(async () => {
    setFullscreenError(false)
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (screen.current?.requestFullscreen) await screen.current.requestFullscreen()
      else setFullscreenError(true)
    } catch { setFullscreenError(true) }
    wakeControls()
  }, [wakeControls])

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Game Theory Night 2 | Presentation'
    wakeControls()
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement))
    const handleKey = (event: KeyboardEvent) => {
      wakeControls()
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const current = navigation.current
      if (['ArrowRight', 'PageDown', 'ArrowLeft', 'PageUp', 'Home', 'End'].includes(event.key) || (event.key === ' ' && !(target instanceof HTMLButtonElement))) {
        event.preventDefault()
        if (event.repeat) return
        if (event.key === 'Home') current.selectSlide(0)
        else if (event.key === 'End') current.selectSlide(presentationSlides.length - 1, presentationSlides.at(-1)!.steps.length - 1)
        else if (['ArrowLeft', 'PageUp'].includes(event.key)) current.retreat()
        else current.advance()
      }
      if (event.key.toLowerCase() === 'f' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        void toggleFullscreen()
      }
    }
    document.addEventListener('fullscreenchange', syncFullscreen)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.title = previousTitle
      clearTimeout(idleTimer.current)
      document.removeEventListener('fullscreenchange', syncFullscreen)
      document.removeEventListener('keydown', handleKey)
    }
  }, [toggleFullscreen, wakeControls])

  return <main id="main-content" className={`presentation-screen${controlsVisible ? '' : ' is-idle'}`} ref={screen} onPointerMove={wakeControls} onPointerDown={wakeControls} onFocusCapture={wakeControls}>
    <div className="presentation-stage"><Slide key={slide.id} step={step} /></div>
    <nav className="presentation-controls" aria-label="Presentation controls">
      <button type="button" aria-label="Previous step" aria-keyshortcuts="ArrowLeft PageUp" disabled={!canRetreat} onClick={() => { retreat(); wakeControls() }}><ChevronLeft aria-hidden="true" /></button>
      <span className="presentation-position" aria-live="polite" aria-label={`Slide ${index + 1} of ${presentationSlides.length}: ${slide.title}. Reveal ${step + 1} of ${slide.steps.length}: ${slide.steps[step]}`}>{index + 1} / {presentationSlides.length}{slide.steps.length > 1 && <small>{step + 1} / {slide.steps.length}</small>}</span>
      <button type="button" aria-label="Next step" aria-keyshortcuts="ArrowRight PageDown" disabled={!canAdvance} onClick={() => { advance(); wakeControls() }}><ChevronRight aria-hidden="true" /></button>
      <button type="button" onClick={() => void toggleFullscreen()} aria-keyshortcuts="f" title="Toggle fullscreen (F)">
        {fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
        {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      </button>
      {fullscreenError && <p role="status">Use your browser’s fullscreen option to fill the screen.</p>}
    </nav>
  </main>
}
