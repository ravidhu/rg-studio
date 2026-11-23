import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { HelpProvider } from '@/components/HelpProvider'
import { I18nProvider } from '@/components/I18nProvider'
import './index.css'

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <I18nProvider>
        <HelpProvider>
          <App />
        </HelpProvider>
      </I18nProvider>
    </StrictMode>,
  )
}
