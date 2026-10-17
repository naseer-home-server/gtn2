import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PresentationStageProvider } from '@/features/presentation/stage-context'
import { HostSlideControls } from '@/features/presentation/host-controls'
import { presentationSlides } from '@/features/presentation/slides'
import { usePresentationSlide } from '@/features/presentation/use-presentation-slide'
import '@/features/presentation/presentation.css'

export function AdminPresentationPage() {
  const { index, slide, step, selectSlide, advance, retreat, canAdvance, canRetreat } = usePresentationSlide({ broadcast: true })
  const Slide = slide.Component
  const presentParams = new URLSearchParams()
  if (index > 0) presentParams.set('slide', slide.id)
  if (step > 0) presentParams.set('step', String(step + 1))
  const presentUrl = `/admin/presentation/present${presentParams.size ? `?${presentParams}` : ''}`
  return <PresentationStageProvider mode="host" game={slide.game} includeTeamEmails={slide.id === 'make-teams'} includeFinalStandings={slide.id === 'final-standings'}><div className="space-y-7">
    <header className="page-intro">
      <h1 className="display-title">Presentation</h1>
      <p>Put game night on the big screen. Keep this host desk open on your laptop.</p>
    </header>
    <div className="presentation-deck-selector"><label htmlFor="presentation-slide-select">Slide {index + 1} / {presentationSlides.length}</label><select id="presentation-slide-select" value={slide.id} onChange={event => selectSlide(presentationSlides.findIndex(item => item.id === event.target.value))}>{[...new Set(presentationSlides.map(item => item.group ?? 'Introduction'))].map(group => <optgroup key={group} label={group}>{presentationSlides.map((item, position) => (item.group ?? 'Introduction') === group && <option key={item.id} value={item.id}>{position + 1}. {item.title}</option>)}</optgroup>)}</select></div>
    <div className="presentation-preview"><Slide key={slide.id} step={step} /></div>
    <div className="presentation-build-controls" aria-label="Preview reveal controls">
      <Button variant="outline" disabled={!canRetreat} onClick={retreat}>Previous step</Button>
      <p role="status">{slide.steps[step]}<span>Reveal {step + 1} of {slide.steps.length}</span></p>
      <Button variant="outline" disabled={!canAdvance} onClick={advance}>Next step</Button>
    </div>
    <HostSlideControls slide={slide} />
    <div className="presentation-launch">
      <div><h2 className="section-heading">{slide.title}</h2><p className="mt-2 text-sm text-muted-foreground">Share only the presentation tab on the TV.<br className="hidden sm:block" /> Use arrow keys or Space to reveal the next visual. F fills the screen.</p></div>
      <Button asChild><Link to={presentUrl} target="_blank" rel="noopener noreferrer">Open presentation<ExternalLink aria-hidden="true" /></Link></Button>
    </div>
    <aside className="presentation-notes" aria-label="Private presenter notes"><h2 className="section-heading">Presenter notes <span>Only here on the host desk</span></h2><p>{slide.notes}</p>{'source' in slide && slide.source && <a className="presentation-source" href={slide.source} target="_blank" rel="noopener noreferrer">Model reference: Duke University</a>}</aside>
  </div></PresentationStageProvider>
}
