import * as React from 'react'
import { useState } from 'react'
import { Activity, Shield, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Button } from './ui/button'
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
  handleAdvancedModeChange: (event: React.ChangeEvent<HTMLInputElement>) => void
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
            title={isCollapsed ? 'Please open the sidebar to access Preferences' : undefined}
            onClick={() => {
              if (isCollapsed) setShowSettings(true)
              if (!isCollapsed) setShowSettings(!showSettings)
              if (isCollapsed) setIsCollapsed(false)
            }}
          >
            <Settings className={cn('h-4 w-4', !isCollapsed && 'mr-2')} />
            {!isCollapsed && 'Preferences'}
          </Button>
          {!isCollapsed && showSettings && (
            <div className="gap-4 shrink-0 animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="gap-4 shrink-0">
                <label
                  className={cn(
                    'themeSwitcherTwo relative inline-flex cursor-pointer select-none items-center',
                    !isCollapsed && 'mr-2'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={darkMode}
                    onChange={handleDarkModeChange}
                    className="sr-only"
                  />
                  <span className={cn('h-4 w-4', !isCollapsed && 'mr-2')}>
                    {!isCollapsed && 'Light'}
                  </span>
                  <span
                    className={`slider mx-4 flex h-8 w-[60px] items-center rounded-full p-1 duration-200 ${
                      darkMode ? 'bg-[#212b36]' : 'bg-[#CCCCCE]'
                    }`}
                  >
                    <span
                      className={`dot h-6 w-6 rounded-full bg-white duration-200 ${
                        darkMode ? 'translate-x-[28px]' : ''
                      }`}
                    ></span>
                  </span>
                  <span className={cn('h-4 w-4', !isCollapsed && 'mr-2')}>
                    {!isCollapsed && 'Dark'}
                  </span>
                </label>
                <label
                  className={cn(
                    'themeSwitcherTwo relative inline-flex cursor-pointer select-none items-center',
                    !isCollapsed && 'mr-2'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={advancedMode}
                    onChange={handleAdvancedModeChange}
                    className="sr-only"
                  />
                  <span className={cn('h-4 w-4', !isCollapsed && 'mr-2')}>
                    {!isCollapsed && 'Basic'}
                  </span>
                  <span
                    className={`slider mx-4 flex h-8 w-[60px] items-center rounded-full p-1 duration-200 ${
                      advancedMode ? 'bg-[#212b36]' : 'bg-[#CCCCCE]'
                    }`}
                  >
                    <span
                      className={`dot h-6 w-6 rounded-full bg-white duration-200 ${
                        advancedMode ? 'translate-x-[28px]' : ''
                      }`}
                    ></span>
                  </span>
                  <span className={cn('h-4 w-4', !isCollapsed && 'mr-2')}>
                    {!isCollapsed && 'Advanced'}
                  </span>
                </label>
                <label
                  className={cn(
                    'themeSwitcherTwo relative inline-flex cursor-pointer select-none items-center',
                    !isCollapsed && 'mr-2'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={colorAccessibility}
                    onChange={toggleColorAccessibility}
                    className="sr-only"
                  />
                  <span className={cn('h-4 w-4', !isCollapsed && 'mr-2')}>
                    {!isCollapsed && 'Color'}
                  </span>
                  <span
                    className={`slider mx-4 flex h-8 w-[60px] items-center rounded-full p-1 duration-200 ${
                      colorAccessibility ? 'bg-[#212b36]' : 'bg-[#CCCCCE]'
                    }`}
                  >
                    <span
                      className={`dot h-6 w-6 rounded-full bg-white duration-200 ${
                        colorAccessibility ? 'translate-x-[28px]' : ''
                      }`}
                    ></span>
                  </span>
                  <span className={cn('h-4 w-4', !isCollapsed && 'mr-2')}>
                    {!isCollapsed && 'Color Accessible'}
                  </span>
                </label>
                <div className="max-w-sm mx-auto">
                  <label
                    htmlFor="number-input"
                    className="block mb-2.5 text-sm font-medium text-heading"
                  >
                    Max Packets
                  </label>
                  <input
                    type="number"
                    id="number-input"
                    aria-describedby="helper-text-explanation"
                    className="block w-full px-3 py-2.5 bg-neutral-secondary-medium border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand shadow-xs placeholder:text-body"
                    value={maxPackets}
                    onChange={(e) => handleMaxPacketsChange(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
