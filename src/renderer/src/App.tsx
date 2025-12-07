import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sidebar } from './components/Sidebar'
import NetworkMonitor from './components/NetworkMonitor'
import { SystemMonitor } from './components/SystemMonitor'

function App(): React.JSX.Element {
  const [viewMode, setViewMode] = useState<'network' | 'system'>('network')
  const [advancedMode, setAdvancedMode] = useState(false)
  const [darkMode, setDarkMode] = useState(false)

  function handleViewModeChange(view: 'network' | 'system'): void {
    setViewMode(view)
    window.api.setValue('viewMode', view)
  }
  useEffect(() => {
    console.log('Loading settings...')
    window.api.getValue('advancedMode').then((value) => {
      if (value === 'true') {
        setAdvancedMode(true)
      } else {
        setAdvancedMode(false)
      }
    })
    console.log('Loading dark mode setting...')
    window.api.getValue('darkMode').then((value) => {
      console.log('Dark mode value:', value)
      if (value === 'true') {
        setDarkMode(true)
      } else {
        setDarkMode(false)
      }
    })
    console.log('Loading view mode setting...')
    window.api.getValue('viewMode').then((value) => {
      if (value === 'network' || value === 'system') {
        setViewMode(value)
      } else {
        setViewMode('network')
      }
    })
    console.log('Settings loaded.')
  }, [])
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans antialiased">
      <Sidebar
        currentView={viewMode}
        onViewChange={handleViewModeChange}
        advancedMode={advancedMode}
        setAdvancedMode={setAdvancedMode}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />
      <main className="flex-1 flex flex-col overflow-hidden relative bg-muted/10">
        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="h-full flex flex-col overflow-hidden"
          >
            {viewMode === 'network' ? (
              <NetworkMonitor advancedMode={advancedMode} darkMode={darkMode} />
            ) : (
              <SystemMonitor />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

export default App
