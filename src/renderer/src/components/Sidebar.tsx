import * as React from 'react'
import { useState } from 'react'
import { Activity, Shield, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from './ui/dialog'
import logo from '../../../../resources/icon.png'

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  colorAccessibility: boolean
  toggleColorAccessibility: () => void
  maxPackets: number
  handleMaxPacketsChange: (value: number) => void
  currentView: 'network' | 'system'
  onViewChange: (view: 'network' | 'system') => void
  advancedMode: boolean
  setAdvancedMode: React.Dispatch<React.SetStateAction<boolean>>
  darkMode: boolean
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>
  handleAdvancedModeChange: () => void
}

export function Sidebar({
  colorAccessibility,
  toggleColorAccessibility,
  maxPackets,
  handleMaxPacketsChange,
  className,
  currentView,
  onViewChange,
  advancedMode,
  darkMode,
  setDarkMode,
  handleAdvancedModeChange
}: SidebarProps): React.JSX.Element {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const handleDarkModeChange = (): void => {
    setDarkMode(!darkMode)
    window.api.setValue('darkMode', (!darkMode).toString())
  }

  return (
    <div
      className={cn(
        'pb-12 border-r bg-card transition-all duration-300 ease-in-out flex flex-col',
        isCollapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      <div
        className={cn('flex items-center p-4', isCollapsed ? 'flex-col gap-4' : 'justify-between')}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <img src={logo} alt="Logo" className="h-8 w-8 shrink-0" />
          {!isCollapsed && (
            <div className="animate-in fade-in duration-300">
              <h2 className="text-lg font-semibold tracking-tight whitespace-nowrap">
                PrivacyRadar
              </h2>
              <p className="text-xs text-muted-foreground whitespace-nowrap">Live Awareness</p>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {!isCollapsed || !showSettings ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="space-y-4 py-4 flex-1">
        <div className="px-3 py-2">
          <div className="space-y-1">
            <Button
              variant={currentView === 'network' ? 'default' : 'ghost'}
              className={cn('w-full', isCollapsed ? 'justify-center px-2' : 'justify-start')}
              onClick={() => onViewChange('network')}
              title={isCollapsed ? 'Network Monitor' : undefined}
            >
              <Activity className={cn('h-4 w-4', !isCollapsed && 'mr-2')} />
              {!isCollapsed && 'Network Monitor'}
            </Button>
            <Button
              variant={currentView === 'system' ? 'default' : 'ghost'}
              className={cn('w-full', isCollapsed ? 'justify-center px-2' : 'justify-start')}
              onClick={() => onViewChange('system')}
              title={isCollapsed ? 'System Monitor' : undefined}
            >
              <Shield className={cn('h-4 w-4', !isCollapsed && 'mr-2')} />
              {!isCollapsed && 'System Monitor'}
            </Button>
          </div>
        </div>
      </div>

      <div className="px-3 py-2 mt-auto">
        <div className="space-y-1">
          <Button
            variant="ghost"
            className={cn('w-full', isCollapsed ? 'justify-center px-2' : 'justify-start')}
            title={isCollapsed ? 'Preferences' : undefined}
            onClick={() => {
              if (isCollapsed) {
                setIsCollapsed(false)
                setShowSettings(true)
              } else {
                setShowSettings(true)
              }
            }}
          >
            <Settings className={cn('h-4 w-4', !isCollapsed && 'mr-2')} />
            {!isCollapsed && 'Preferences'}
          </Button>
        </div>
      </div>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogClose onClose={() => setShowSettings(false)} />
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Preferences
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-6">
            {/* Theme Toggle */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Theme</label>
              <label className="themeSwitcherTwo relative flex cursor-pointer select-none items-center w-full">
                <span className="text-sm w-20 text-left">Light</span>
                <input
                  type="checkbox"
                  checked={darkMode}
                  onChange={handleDarkModeChange}
                  className="sr-only"
                />
                <span
                  className={`slider mx-4 flex h-8 w-[60px] items-center rounded-full p-1 duration-200 flex-shrink-0 ${
                    darkMode ? 'bg-[#212b36]' : 'bg-[#CCCCCE]'
                  }`}
                >
                  <span
                    className={`dot h-6 w-6 rounded-full bg-white duration-200 ${
                      darkMode ? 'translate-x-[28px]' : ''
                    }`}
                  ></span>
                </span>
                <span className="text-sm w-20 text-right">Dark</span>
              </label>
            </div>

            {/* Mode Toggle */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Display Mode</label>
              <label className="themeSwitcherTwo relative flex cursor-pointer select-none items-center w-full">
                <span className="text-sm w-20 text-left">Basic</span>
                <input
                  type="checkbox"
                  checked={advancedMode}
                  onChange={() => handleAdvancedModeChange()}
                  className="sr-only"
                />
                <span
                  className={`slider mx-4 flex h-8 w-[60px] items-center rounded-full p-1 duration-200 flex-shrink-0 ${
                    advancedMode ? 'bg-[#212b36]' : 'bg-[#CCCCCE]'
                  }`}
                >
                  <span
                    className={`dot h-6 w-6 rounded-full bg-white duration-200 ${
                      advancedMode ? 'translate-x-[28px]' : ''
                    }`}
                  ></span>
                </span>
                <span className="text-sm w-20 text-right">Advanced</span>
              </label>
            </div>

            {/* Color Accessibility Toggle */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Color Accessibility</label>
              <label className="themeSwitcherTwo relative flex cursor-pointer select-none items-center w-full">
                <span className="text-sm w-20 text-left">Color</span>
                <input
                  type="checkbox"
                  checked={colorAccessibility}
                  onChange={toggleColorAccessibility}
                  className="sr-only"
                />
                <span
                  className={`slider mx-4 flex h-8 w-[60px] items-center rounded-full p-1 duration-200 flex-shrink-0 ${
                    colorAccessibility ? 'bg-[#212b36]' : 'bg-[#CCCCCE]'
                  }`}
                >
                  <span
                    className={`dot h-6 w-6 rounded-full bg-white duration-200 ${
                      colorAccessibility ? 'translate-x-[28px]' : ''
                    }`}
                  ></span>
                </span>
                <span className="text-sm w-20 text-right">Accessible</span>
              </label>
            </div>

            {/* Max Packets Input */}
            <div className="space-y-3">
              <label htmlFor="number-input" className="text-sm font-medium block">
                Max Packets
              </label>
              <input
                type="number"
                id="number-input"
                aria-describedby="helper-text-explanation"
                className="block w-full px-4 py-2.5 bg-background border border-input text-foreground text-sm rounded-md focus:ring-2 focus:ring-ring focus:border-ring transition-colors"
                value={maxPackets}
                onChange={(e) => handleMaxPacketsChange(Number(e.target.value))}
                min="1"
                required
              />
              <p id="helper-text-explanation" className="text-xs text-muted-foreground">
                Maximum number of packets to display in the network monitor
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
