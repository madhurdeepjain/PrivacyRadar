import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import { PacketMetadata, ProcessRegistry } from 'src/main/shared/interfaces/common'
import { CardContent, CardHeader, Card, CardTitle } from './ui/card'
import { PieChart } from 'lucide-react'

function Visualization({
  colorAccessibility,
  registries,
  packets
}: {
  colorAccessibility: boolean
  registries: Array<Map<string, ProcessRegistry>>
  packets: Array<PacketMetadata>
}): React.JSX.Element {
  const chartRef = useRef<HTMLCanvasElement>(null!)
  const pieChartRef = useRef<HTMLCanvasElement>(null!)
  const chartInstance = useRef<Chart>(null!)
  const pieChartInstance = useRef<Chart>(null!)

  function getCountByTimestamp(packets: Array<PacketMetadata>): Record<string, number> {
    const countMap: Record<string, number> = {}
    packets.forEach((packet) => {
      countMap[packet.timestamp] = (countMap[packet.timestamp] || 0) + 1
    })
    return countMap
  }

  useEffect(() => {
    if (!chartRef.current) return
    const ctx = chartRef.current.getContext('2d')
    if (!ctx) return
    if (chartInstance.current) return
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Number of Packets',
            data: [],
            borderWidth: 1,
            backgroundColor: colorAccessibility ? '#0C7BDC' : 'green',
            borderColor: colorAccessibility ? '#0C7BDC' : 'green'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Network Traffic Over Time'
          }
        },
        elements: {
          line: {
            spanGaps: true // Explicitly set to false if needed
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              font: {
                size: 20
              }
            }
          },
          y: {
            grid: {
              display: false
            },
            ticks: {
              display: false // This hides the Y-axis tick labels
            }
          }
        }
      }
    })
    if (!pieChartRef.current) return
    const ctx2 = pieChartRef.current.getContext('2d')
    if (!ctx2) return
    if (pieChartInstance.current) return
    pieChartInstance.current = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            backgroundColor: colorAccessibility ? ['#FFC20A', '#0C7BDC'] : ['green', 'red']
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Network Traffic Over Time'
          }
        },
        elements: {
          line: {
            spanGaps: true // Explicitly set to false if needed
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              display: false // This hides the Y-axis tick labels
            }
          }
        }
      }
    })
  }, [registries, colorAccessibility])
  useEffect(() => {
    if (!packets) return
    const countByTimestamp = getCountByTimestamp(packets)
    const inboundSum = Array.from(registries[registries.length - 1].values()).reduce(
      (acc, registry) => acc + registry.inboundBytes,
      0
    )
    const outboundSum = Array.from(registries[registries.length - 1].values()).reduce(
      (acc, registry) => acc + registry.outboundBytes,
      0
    )
    if (!chartInstance.current || !pieChartInstance.current) return
    pieChartInstance.current.data.datasets[0].data = [inboundSum, outboundSum]
    pieChartInstance.current.data.labels = ['Inbound', 'Outbound']
    pieChartInstance.current.data.datasets[0].backgroundColor = ['green', 'red']
    chartInstance.current.data.labels = Object.keys(countByTimestamp).reduce(
      (acc: string[], timestamp) => {
        const date = new Date(Number(timestamp))
        acc.push(date.toLocaleTimeString())
        return acc
      },
      []
    )
    pieChartInstance.current.data.datasets[0].backgroundColor = colorAccessibility
      ? ['#0C7BDC', '#FFC20A']
      : ['green', 'red']
    chartInstance.current.data.datasets[0].backgroundColor = colorAccessibility
      ? '#0C7BDC'
      : 'green'
    chartInstance.current.data.datasets[0].borderColor = colorAccessibility ? '#0C7BDC' : 'green'
    chartInstance.current.data.datasets[0].data = Object.values(countByTimestamp)
    pieChartInstance.current.update()
    chartInstance.current.update()
  }, [registries, packets, colorAccessibility])

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <PieChart className="h-5 w-5" />
          Traffic Visualizations
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto no-scrollbar pr-2">
        <div style={{ height: '500px', width: '100%' }}>
          <canvas id="myChart" ref={chartRef}></canvas>
        </div>
        <div style={{ height: '500px', width: '100%' }}>
          <canvas id="myPieChart" ref={pieChartRef}></canvas>
        </div>
      </CardContent>
    </Card>
  )
}

export default Visualization
