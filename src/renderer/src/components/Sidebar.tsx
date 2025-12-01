import * as React from 'react'
import { useState } from 'react'
import { Activity, Shield, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Button } from './ui/button'
import logo from '../../../../resources/icon.png'

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  currentView: 'network' | 'system'
  onViewChange: (view: 'network' | 'system') => void
}

export function Sidebar({ className, currentView, onViewChange }: SidebarProps): React.JSX.Element {
  const [isCollapsed, setIsCollapsed] = useState(false)

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
          {isCollapsed ? (
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
          >
            <Settings className={cn('h-4 w-4', !isCollapsed && 'mr-2')} />
            {!isCollapsed && 'Preferences'}
          </Button>
        </div>
      </div>
    </div>
  )
}
