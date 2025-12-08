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
  const dataHistoryRef = useRef<Array<{ timestamp: number; bytes: number }>>([])
  const maxYValueRef = useRef<number>(0)

  function aggregateBytesByTimeWindow(
    packets: Array<PacketMetadata>,
    windowSizeMs: number = 5000,
    maxWindows: number = 15
  ): Array<{ time: string; bytes: number }> {
    // Use current time as reference for the rolling window
    const now = Date.now()
    const currentWindowStart = Math.floor(now / windowSizeMs) * windowSizeMs

    // Group packets into time windows and sum bytes
    const windowMap: Record<number, number> = {}
    packets.forEach((packet) => {
      const timestamp = Number(packet.timestamp)
      const windowStart = Math.floor(timestamp / windowSizeMs) * windowSizeMs
      const packetSize = packet.size || 0
      windowMap[windowStart] = (windowMap[windowStart] || 0) + packetSize
    })

    // Update history with new data - merge with existing history
    Object.entries(windowMap).forEach(([time, bytes]) => {
      const timestamp = Number(time)
      const existingIndex = dataHistoryRef.current.findIndex((d) => d.timestamp === timestamp)
      if (existingIndex >= 0) {
        // Update existing window - accumulate bytes
        dataHistoryRef.current[existingIndex].bytes += bytes
      } else {
        // Add new window
        dataHistoryRef.current.push({ timestamp, bytes })
      }
    })

    // Remove windows older than 2 minutes (keep recent history)
    const cutoffTime = currentWindowStart - 120000 // 2 minutes
    dataHistoryRef.current = dataHistoryRef.current.filter((d) => d.timestamp >= cutoffTime)

    // Get only windows with data, sorted by time
    const windowsWithData = dataHistoryRef.current
      .filter((d) => d.bytes > 0)
      .sort((a, b) => a.timestamp - b.timestamp)

    // Only show the most recent maxWindows windows that have data
    const recentWindows = windowsWithData.slice(-maxWindows)

    // Convert to display format
    return recentWindows.map((d) => ({
      time: new Date(d.timestamp).toLocaleTimeString(),
      bytes: d.bytes
    }))
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
            label: 'Bytes per 5s',
            data: [],
            borderWidth: 2,
            backgroundColor: colorAccessibility
              ? 'rgba(12, 123, 220, 0.1)'
              : 'rgba(0, 128, 0, 0.1)',
            borderColor: colorAccessibility ? '#0C7BDC' : 'green',
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointHoverRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Data Transfer Rate Over Time (5s intervals)',
            font: {
              size: 14
            }
          },
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const bytes = context.parsed.y
                if (bytes == null) return '0 B'
                if (bytes < 1024) return `${bytes.toFixed(0)} B`
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
                return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              font: {
                size: 10
              },
              maxRotation: 45,
              minRotation: 45,
              maxTicksLimit: 8
            }
          },
          y: {
            grid: {
              display: true,
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              font: {
                size: 10
              },
              callback: function (value) {
                const bytes = Number(value)
                if (bytes < 1024) return `${bytes.toFixed(0)} B`
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
                return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
              }
            },
            beginAtZero: true,
            max: undefined // Will be set dynamically but stable
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
            text: 'Inbound/Outbound Traffic',
            font: {
              size: 14
            }
          },
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              font: {
                size: 11
              },
              padding: 8,
              boxWidth: 12,
              boxHeight: 12
            }
          }
        }
      }
    })
  }, [registries, colorAccessibility])
  useEffect(() => {
    if (!packets || packets.length === 0) return
    const aggregatedData = aggregateBytesByTimeWindow(packets, 5000)
    const inboundSum = Array.from(registries[registries.length - 1].values()).reduce(
      (acc, registry) => acc + registry.inboundBytes,
      0
    )
    const outboundSum = Array.from(registries[registries.length - 1].values()).reduce(
      (acc, registry) => acc + registry.outboundBytes,
      0
    )
    if (!chartInstance.current || !pieChartInstance.current) return

    // Update pie chart
    pieChartInstance.current.data.datasets[0].data = [inboundSum, outboundSum]
    pieChartInstance.current.data.labels = ['Inbound', 'Outbound']
    pieChartInstance.current.data.datasets[0].backgroundColor = colorAccessibility
      ? ['#0C7BDC', '#FFC20A']
      : ['green', 'red']

    // Update line chart with aggregated bytes data
    chartInstance.current.data.labels = aggregatedData.map((d) => d.time)
    chartInstance.current.data.datasets[0].data = aggregatedData.map((d) => d.bytes)
    chartInstance.current.data.datasets[0].borderColor = colorAccessibility ? '#0C7BDC' : 'green'
    chartInstance.current.data.datasets[0].backgroundColor = colorAccessibility
      ? 'rgba(12, 123, 220, 0.1)'
      : 'rgba(0, 128, 0, 0.1)'

    // Update Y-axis max to maintain stable scale
    if (aggregatedData.length > 0 && chartInstance.current.options.scales?.y) {
      const currentMax = Math.max(...aggregatedData.map((d) => d.bytes))

      // Update max value: increase if current max is higher, or reset if significantly lower
      if (currentMax > maxYValueRef.current) {
        maxYValueRef.current = currentMax
      } else if (currentMax < maxYValueRef.current * 0.3 && maxYValueRef.current > 0) {
        // If current max is less than 30% of stored max, reset to current (traffic dropped significantly)
        maxYValueRef.current = currentMax
      }

      // Add 20% padding to the max value for better visualization
      const paddedMax = maxYValueRef.current * 1.2
      // Round up to a nice round number based on magnitude
      let roundedMax: number
      if (paddedMax < 1024) {
        roundedMax = Math.ceil(paddedMax / 100) * 100 // Round to nearest 100B
      } else if (paddedMax < 1024 * 1024) {
        roundedMax = Math.ceil(paddedMax / 10000) * 10000 // Round to nearest 10KB
      } else {
        roundedMax = Math.ceil(paddedMax / (100 * 1024 * 1024)) * (100 * 1024 * 1024) // Round to nearest 100MB
      }

      chartInstance.current.options.scales.y.max = roundedMax
    }

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
      <CardContent className="flex-1 overflow-hidden flex flex-col gap-4 pb-4">
        <div style={{ height: '400px', width: '100%' }}>
          <canvas id="myChart" ref={chartRef}></canvas>
        </div>
        <div style={{ height: '340px', width: '100%', paddingBottom: '40px' }}>
          <canvas id="myPieChart" ref={pieChartRef}></canvas>
        </div>
      </CardContent>
    </Card>
  )
}

export default Visualization
