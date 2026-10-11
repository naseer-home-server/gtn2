import { useMutation, useQuery } from '@tanstack/react-query'
import Session, { useSessionContext } from 'supertokens-auth-react/recipe/session'
import ThirdParty from 'supertokens-auth-react/recipe/thirdparty'
import EmailPassword from 'supertokens-auth-react/recipe/emailpassword'
import { queryClient } from '../lib/query-client'
import { trpc } from '../trpc'

export function useAuth() {
  const session = useSessionContext()
  const userId = session.loading ? null : session.userId
  const signedIn = !session.loading && session.doesSessionExist
  return useQuery({
    queryKey: ['auth', 'me', userId, signedIn],
    queryFn: () => signedIn ? trpc.auth.me.query() : Promise.resolve(null),
    enabled: !session.loading,
    refetchInterval: signedIn ? 5_000 : false,
  })
}
export function useLoginSettings() {
  return useQuery({ queryKey: ['auth', 'settings'], queryFn: () => trpc.auth.settings.query(), refetchInterval: 5_000 })
}
export function useGoogleLogin() {
  return useMutation({ mutationFn: async () => {
    const url = await ThirdParty.getAuthorisationURLWithQueryParamsAndSetState({
      thirdPartyId: 'google', frontendRedirectURI: `${window.location.origin}/login/callback/google`,
      shouldTryLinkingWithSessionUser: false,
    })
    window.location.assign(url)
  } })
}
export function useLocalPasswordLogin() {
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => EmailPassword.signIn({
      formFields: [{ id: 'email', value: input.email }, { id: 'password', value: input.password }],
    }),
    onSuccess: (result) => { if (result.status === 'OK') queryClient.clear() },
  })
}
export function useTestEmailLogin() {
  return useMutation({
    mutationFn: (email: string) => trpc.auth.testEmailLogin.mutate({ email }),
    onSuccess: () => { queryClient.clear() },
  })
}
export function useSignOut() {
  return useMutation({
    mutationFn: () => Session.signOut(),
    onSuccess: () => { queryClient.clear() },
  })
}
