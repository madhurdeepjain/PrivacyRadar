import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sidebar } from './components/Sidebar'
import NetworkMonitor from './components/NetworkMonitor'
import { SystemMonitor } from './components/SystemMonitor'

function App(): React.JSX.Element {
  const [viewMode, setViewMode] = useState<'network' | 'system'>('network')
  const [advancedMode, setAdvancedMode] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [maxPackets, setMaxPackets] = useState(500)
  const [colorAccessibility, setColorAccessibility] = useState(true)

  function toggleColorAccessibility(): void {
    setColorAccessibility(!colorAccessibility)
    window.api.setValue('colorAccessibility', (!colorAccessibility).toString())
  }

  function handleMaxPacketsChange(value: number): void {
    setMaxPackets(value)
    window.api.setValue('maxPackets', value.toString())
  }

  function handleViewModeChange(view: 'network' | 'system'): void {
    setViewMode(view)
    window.api.setValue('viewMode', view)
  }

  const handleAdvancedModeChange = (): void => {
    setAdvancedMode(!advancedMode)
    window.api.setValue('advancedMode', (!advancedMode).toString())
  }
  useEffect(() => {
    window.api.getValue('advancedMode').then((value) => {
      if (value === 'true') {
        setAdvancedMode(true)
      } else {
        setAdvancedMode(false)
      }
    })
    window.api.getValue('darkMode').then((value) => {
      if (value === 'true') {
        setDarkMode(true)
      } else {
        setDarkMode(false)
      }
    })
    window.api.getValue('viewMode').then((value) => {
      if (value === 'network' || value === 'system') {
        setViewMode(value)
      } else {
        setViewMode('network')
      }
    })
    window.api.getValue('maxPackets').then((value) => {
      const parsedValue = parseInt(value, 10)
      if (!isNaN(parsedValue)) {
        setMaxPackets(parsedValue)
      } else {
        setMaxPackets(500)
      }
    })
    console.log('Loading color accessibility setting...')
    window.api.getValue('colorAccessibility').then((value) => {
      if (value === 'true') {
        setColorAccessibility(true)
      } else {
        setColorAccessibility(false)
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
        colorAccessibility={colorAccessibility}
        toggleColorAccessibility={toggleColorAccessibility}
        maxPackets={maxPackets}
        handleMaxPacketsChange={handleMaxPacketsChange}
        currentView={viewMode}
        onViewChange={handleViewModeChange}
        advancedMode={advancedMode}
        setAdvancedMode={setAdvancedMode}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        handleAdvancedModeChange={handleAdvancedModeChange}
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
              <NetworkMonitor
                colorAccessibility={colorAccessibility}
                handleAdvancedModeChange={handleAdvancedModeChange}
                advancedMode={advancedMode}
                darkMode={darkMode}
                maxPackets={maxPackets}
              />
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
