import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { CardContent, CardHeader, Card, CardTitle } from './ui/card'
import type { ProcessRegistry } from '../../../main/shared/interfaces/common'
import { data } from '../lib/data'
import { Earth } from 'lucide-react'

function GlobalMap({
  colorAccessibility,
  registries,
  location
}: {
  colorAccessibility: boolean
  registries: Array<Map<string, ProcessRegistry>>
  location: { lat: number; lon: number } | null
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>

  // Create projection that centers the map better - centered on 0 longitude, 20 latitude
  // Scale adjusted to show a good view of the world
  const projection = d3.geoMercator().center([0, 20]).scale(180)
  const geoPathGenerator = d3.geoPath().projection(projection)
  const backgroundMapSvgElements = data.features
    .filter((shape) => shape.id !== 'ATA')
    .map((shape) => {
      return (
        <path
          key={shape.id}
          d={geoPathGenerator(shape) ?? undefined}
          stroke="lightGrey"
          strokeWidth={0.5}
          fill="grey"
          fillOpacity={0.7}
        />
      )
    })

  useEffect(() => {
    if (!location) return
    const svg = d3.select('#mySvg')
    Array.from(registries[registries.length - 1].values()).forEach((registry) => {
      registry.geoLocations.forEach((loc) => {
        const path = svg
          .append('path')
          .attr('class', 'my-path')
          .attr(
            'd',
            geoPathGenerator({
              type: 'LineString',
              coordinates: [
                [loc.lon, loc.lat],
                [location.lon, location.lat]
              ]
            })
          )
          .attr('stroke', colorAccessibility ? '#FFC20A' : 'red')
          .attr('strokeWidth', 3)
          .attr('fill', 'none')
        // Measure the length of the drawn path
        if (!path.node()) return
        const totalLength = path.node()!.getTotalLength()

        // Set up the animation
        path
          .attr('stroke-dasharray', totalLength + ' ' + totalLength)
          .attr('stroke-dashoffset', totalLength)
          .transition()
          .duration(2000)
          .ease(d3.easeLinear)
          .attr('stroke-dashoffset', 0)
      })
    })
  }, [registries, geoPathGenerator, location, colorAccessibility])
  return (
    <Card className="h-1/2 flex flex-col gap-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Earth className="h-5 w-5" />
          Global Traffic
        </CardTitle>
      </CardHeader>
      <CardContent ref={containerRef} className="flex-1 overflow-hidden pr-2 flex items-center justify-center">
        <svg
          id="mySvg"
          width="100%"
          height="100%"
          style={{ backgroundRepeat: 'repeat-y' }}
          viewBox="0 0 1000 500"
          preserveAspectRatio="xMidYMid meet"
        >
          {backgroundMapSvgElements}
        </svg>
      </CardContent>
    </Card>
  )
}

export default GlobalMap
