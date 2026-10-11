import SuperTokens from 'supertokens-auth-react'
import ThirdParty, { Google } from 'supertokens-auth-react/recipe/thirdparty'
import EmailPassword from 'supertokens-auth-react/recipe/emailpassword'
import Session from 'supertokens-auth-react/recipe/session'

export const isLocalAuth = import.meta.env.DEV && import.meta.env.VITE_LOCAL === 'true'

export function initSuperTokens() {
  const origin = window.location.origin
  SuperTokens.init({
    appInfo: {
      appName: 'Game Theory Night 2', apiDomain: origin, websiteDomain: origin,
      apiBasePath: '/auth', websiteBasePath: '/login',
    },
    recipeList: [
      ...(isLocalAuth ? [EmailPassword.init()] : [ThirdParty.init({ signInAndUpFeature: { providers: [Google.init()] } })]),
      Session.init(),
    ],
  })
}
