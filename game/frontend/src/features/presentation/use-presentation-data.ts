import { useQuery } from '@tanstack/react-query'
import type { GameId } from 'backend/game'
import { trpc } from '@/trpc'
export type PresentationScope = { game?: GameId; includeTeamEmails?: boolean; includeFinalStandings?: boolean }
export function usePresentationData({game, includeTeamEmails = false, includeFinalStandings = false}: PresentationScope = {}, enabled = true) {
  return useQuery({
    queryKey:['presentation','state',game ?? 'intro',...(includeTeamEmails ? ['team-emails'] : []),...(includeFinalStandings ? ['final-standings'] : [])],
    queryFn:() => trpc.admin.presentation.state.query({game,includeTeamEmails,includeFinalStandings}),
    enabled, staleTime:includeFinalStandings ? 0 : undefined, gcTime:includeFinalStandings ? 0 : undefined, refetchInterval:1000, refetchIntervalInBackground:true, refetchOnWindowFocus:'always', retry:false,
  })
}
