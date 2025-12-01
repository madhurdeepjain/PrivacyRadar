import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sidebar } from './components/Sidebar'
import { NetworkMonitor } from './components/NetworkMonitor'
import { SystemMonitor } from './components/SystemMonitor'

function App(): React.JSX.Element {
  const [viewMode, setViewMode] = useState<'network' | 'system'>('network')

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans antialiased">
      <Sidebar currentView={viewMode} onViewChange={setViewMode} />
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
            {viewMode === 'network' ? <NetworkMonitor /> : <SystemMonitor />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

export default App
