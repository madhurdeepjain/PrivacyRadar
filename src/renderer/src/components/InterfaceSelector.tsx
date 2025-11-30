import { useMemo } from 'react'
import { Check, Wifi, Network, Globe, Laptop } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { cn } from '@renderer/lib/utils'
import { InterfaceOption } from '../types'

interface InterfaceSelectorProps {
  interfaces: InterfaceOption[]
  selectedInterfaces: string[]
  isCapturing: boolean
  isSwitching: boolean
  onToggle: (name: string, checked: boolean) => void
  onSelectAll: () => void
}

export function InterfaceSelector({
  interfaces,
  selectedInterfaces,
  isCapturing,
  isSwitching,
  onToggle,
  onSelectAll
}: InterfaceSelectorProps) {
  const getInterfaceCategory = (iface: InterfaceOption): string => {
    const name = iface.name.toLowerCase()
    const description = (iface.description || '').toLowerCase()
    const friendly = (iface.friendlyName || '').toLowerCase()

    if (name.startsWith('lo') || description.includes('loopback') || friendly.includes('loopback'))
      return 'Loopback'
    if (
      description.includes('wi-fi') ||
      description.includes('wifi') ||
      description.includes('wireless') ||
      friendly.includes('wi-fi') ||
      friendly.includes('wifi')
    )
      return 'Wi-Fi & Wireless'
    if (
      name.startsWith('en') ||
      description.includes('ethernet') ||
      description.includes('lan') ||
      friendly.includes('ethernet')
    )
      return 'Ethernet & Wired'
    if (
      description.includes('virtual') ||
      description.includes('vmware') ||
      description.includes('hyper-v') ||
      description.includes('vpn') ||
      friendly.includes('virtual') ||
      friendly.includes('vpn')
    )
      return 'Virtual & Tunnels'
    return 'Other'
  }

  const groupedInterfaces = useMemo(() => {
    const groups: Record<string, InterfaceOption[]> = {}
    interfaces.forEach((iface) => {
      const category = getInterfaceCategory(iface)
      if (!groups[category]) groups[category] = []
      groups[category].push(iface)
    })
    return groups
  }, [interfaces])

  const orderedGroups = useMemo(() => {
    const priority = [
      'Wi-Fi & Wireless',
      'Ethernet & Wired',
      'Loopback',
      'Virtual & Tunnels',
      'Other'
    ]
    const entries: Array<[string, InterfaceOption[]]> = []
    priority.forEach((cat) => {
      if (groupedInterfaces[cat]?.length) entries.push([cat, groupedInterfaces[cat]])
    })
    Object.entries(groupedInterfaces).forEach(([cat, list]) => {
      if (!priority.includes(cat)) entries.push([cat, list])
    })
    return entries
  }, [groupedInterfaces])

  const getIconForCategory = (category: string) => {
    if (category.includes('Wi-Fi')) return Wifi
    if (category.includes('Ethernet')) return Network
    if (category.includes('Loopback')) return Laptop
    return Globe
  }

  if (interfaces.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          No network interfaces detected.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full flex flex-col max-h-[50vh]">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Network Interfaces</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSelectAll}
            disabled={isCapturing || isSwitching}
            className="h-8 text-xs"
          >
            Select All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 overflow-y-auto pr-2">
        {orderedGroups.map(([category, items]) => {
          const CategoryIcon = getIconForCategory(category)
          return (
            <div key={category} className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground sticky top-0 bg-card py-1 z-10">
                <CategoryIcon className="h-4 w-4" />
                <span>{category}</span>
                <Badge variant="secondary" className="ml-auto text-[10px] h-5">
                  {items.filter((i) => selectedInterfaces.includes(i.name)).length}/{items.length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map((iface) => {
                  const isSelected = selectedInterfaces.includes(iface.name)
                  return (
                    <div
                      key={iface.name}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer hover:bg-accent/50",
                        isSelected && "border-primary bg-accent"
                      )}
                      onClick={() => !isCapturing && !isSwitching && onToggle(iface.name, !isSelected)}
                    >
                      <div
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary",
                          isSelected ? "bg-primary text-primary-foreground" : "opacity-50"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      <div className="space-y-1 overflow-hidden">
                        <p className="text-sm font-medium leading-none truncate">
                          {iface.friendlyName || iface.description || iface.name}
                        </p>
                        {(iface.friendlyName || iface.description) && iface.friendlyName !== iface.name && (
                          <p className="text-xs text-muted-foreground truncate">{iface.name}</p>
                        )}
                        {iface.addresses.length > 0 && (
                          <p className="text-[10px] text-muted-foreground truncate font-mono">
                            {iface.addresses[0]}
                            {iface.addresses.length > 1 && ` +${iface.addresses.length - 1}`}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
