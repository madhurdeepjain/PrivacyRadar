import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import { GlobalRegistry } from 'src/main/shared/interfaces/common'
import { CardContent, CardHeader, Card, CardTitle } from './ui/card'
import { PieChart } from 'lucide-react'

function Visualization(): React.JSX.Element {
  const chartRef = useRef<HTMLCanvasElement>(null!)
  const pieChartRef = useRef<HTMLCanvasElement>(null!)
  const chartInstance = useRef<Chart>(null!)
  const pieChartInstance = useRef<Chart>(null!)
  const registryHistory = useRef<Array<Map<string, GlobalRegistry>>>(
    new Array<Map<string, GlobalRegistry>>()
  )

  useEffect(() => {
    if (!chartRef.current) return
    const ctx = chartRef.current.getContext('2d')
    if (!ctx) return
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Number of Packets',
            data: [],
            borderWidth: 1,
            backgroundColor: 'green',
            borderColor: 'green'
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
    pieChartInstance.current = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            backgroundColor: []
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
  }, [])
  useEffect(() => {
    window.api.onGlobalRegistryData((data: Map<string, GlobalRegistry>) => {
      console.log(data)
      // if (data !== undefined) {
      //   if (registryHistory.current.length === 0) {
      //     chartInstance.current.data.datasets[0].data.push(
      //       Array.from(data.values()).reduce((acc, registry) => acc + registry.totalPackets, 0)
      //     )
      //   } else {
      //     chartInstance.current.data.datasets[0].data.push(
      //       Array.from(data.values()).reduce((acc, registry) => acc + registry.totalPackets, 0) -
      //         Array.from(
      //           registryHistory.current[registryHistory.current.length - 1].values()
      //         ).reduce((acc, registry) => acc + registry.totalPackets, 0)
      //     )
      //   }
      //   const inboundSum = Array.from(data.values()).reduce(
      //     (acc, registry) => acc + registry.inboundBytes,
      //     0
      //   )
      //   const outboundSum = Array.from(data.values()).reduce(
      //     (acc, registry) => acc + registry.outboundBytes,
      //     0
      //   )
      //   pieChartInstance.current.data.datasets[0].data = [inboundSum, outboundSum]
      //   pieChartInstance.current.data.labels = ['Inbound', 'Outbound']
      //   pieChartInstance.current.data.datasets[0].backgroundColor = ['green', 'red']
      //   chartInstance.current.data.labels?.push(new Date().toLocaleTimeString())
      //   if (chartInstance.current.data.labels && chartInstance.current.data.labels.length > 25) {
      //     chartInstance.current.data.labels.shift()
      //     chartInstance.current.data.datasets[0].data.shift()
      //     chartInstance.current.data.datasets[1].data.shift()
      //   }
      //   registryHistory.current.push(data)
      //   pieChartInstance.current.update()
      //   chartInstance.current.update()
      // }
    })
  }, [])

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
