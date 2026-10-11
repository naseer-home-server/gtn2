import SuperTokens from 'supertokens-auth-react'
import ThirdParty, { Google } from 'supertokens-auth-react/recipe/thirdparty'
import Session from 'supertokens-auth-react/recipe/session'

export function initSuperTokens() {
  const origin = window.location.origin
  SuperTokens.init({
    appInfo: {
      appName: 'Game Theory Night 2', apiDomain: origin, websiteDomain: origin,
      apiBasePath: '/auth', websiteBasePath: '/login',
    },
    recipeList: [ThirdParty.init({ signInAndUpFeature: { providers: [Google.init()] } }), Session.init()],
  })
}
