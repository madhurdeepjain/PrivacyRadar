import { motion, AnimatePresence } from 'framer-motion'
import AdvancedNetworkMonitor from './AdvancedNetworkMonitor'
import BasicNetworkMonitor from './BasicNetworkMonitor'

function NetworkMonitor({
  advancedMode,
  darkMode
}: {
  advancedMode: boolean
  darkMode: boolean
}): React.JSX.Element {
  return (
    <main className="flex-1 flex flex-col overflow-hidden relative bg-muted/10">
      <AnimatePresence mode="wait">
        <motion.div
          key={advancedMode}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="h-full flex flex-col overflow-hidden"
        >
          {advancedMode ? <AdvancedNetworkMonitor darkMode={darkMode} /> : <BasicNetworkMonitor />}
        </motion.div>
      </AnimatePresence>
    </main>
  )
}

export default NetworkMonitor
