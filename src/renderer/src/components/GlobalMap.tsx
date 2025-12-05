import { useState, useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { CardContent, CardHeader, Card, CardTitle } from './ui/card'
import type { ApplicationRegistry } from '../../../main/shared/interfaces/common'
import { data } from '../lib/data'
import { Earth } from 'lucide-react'

function GlobalMap(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>
  const [registries, setRegistries] = useState<Map<string, ApplicationRegistry>>(new Map())
  const [location, setLocation] = useState({ lat: 0, lon: 0 })
  // const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const projection = d3
    .geoMercator()
    .center([-40, 30])
    // .scale(dimensions.width / 2 / Math.PI)
    // .translate([dimensions.width / 2, dimensions.height / 2])
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
  // useEffect(() => {
  //   const updateDimensions = (): void => {
  //     if (containerRef.current) {
  //       setDimensions({
  //         width: containerRef.current.offsetWidth,
  //         height: containerRef.current.offsetHeight
  //       })
  //     }
  //   }

  //   updateDimensions() // Initial measurement

  //   window.addEventListener('resize', updateDimensions)

  //   return () => {
  //     window.removeEventListener('resize', updateDimensions)
  //   }
  // }, [])
  useEffect(() => {
    window.api.getPublicIP().then((publicIp) => {
      window.api.getGeoLocation(publicIp).then((loc) => {
        setLocation(loc)
      })
    })
  }, [])
  useEffect(() => {
    window.api.onApplicationRegistryData((data: Map<string, ApplicationRegistry>) => {
      const svg = d3.select('#mySvg') // Select your SVG container
      setRegistries(data)
      Array.from(registries.values()).forEach((registry) => {
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
            .attr('stroke', 'red')
            .attr('strokeWidth', 3)
            .attr('fill', 'none')
          // Measure the length of the drawn path
          const totalLength = path.node().getTotalLength()

          // Set up the animation
          path
            .attr('stroke-dasharray', totalLength + ' ' + totalLength)
            .attr('stroke-dashoffset', totalLength)
            .transition() // Start the transition
            .duration(2000) // Animation duration in ms
            .ease(d3.easeLinear) // Use a linear easing for a consistent speed
            .attr('stroke-dashoffset', 0) // Animate the offset to 0
        })
      })
    })
  }, [registries, geoPathGenerator, location, setRegistries, setLocation])
  return (
    <Card className="h-1/2 flex flex-col gap-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Earth className="h-5 w-5" />
          Global Traffic
        </CardTitle>
      </CardHeader>
      <CardContent ref={containerRef} className="flex-1 overflow-auto no-scrollbar pr-2">
        <svg id="mySvg" width="100%" height="100%" style={{ backgroundRepeat: 'repeat-y' }}>
          {backgroundMapSvgElements}
        </svg>
      </CardContent>
    </Card>
  )
}

export default GlobalMap
