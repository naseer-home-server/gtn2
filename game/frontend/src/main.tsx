import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { initSuperTokens } from './config/supertokens'
import { queryClient } from './lib/query-client'
import './index.css'
import './styles/admin-polish.css'
import './styles/chats-polish.css'
import App from './App.tsx'

initSuperTokens()
createRoot(document.getElementById('root')!).render(
  <StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></StrictMode>,
)
