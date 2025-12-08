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
              stepSize: 25 * 1024 * 1024, // 5 MBps intervals = 25 MB per 5s window (5 MBps * 5 seconds)
              callback: function (value) {
                // Convert bytes per 5s window to MBps (divide by 5 seconds and convert to MB)
                const bytesPer5s = Number(value)
                const mbps = bytesPer5s / (5 * 1024 * 1024) // Convert to MBps
                return `${mbps.toFixed(1)} MBps`
              }
            },
            beginAtZero: true,
            max: 25 * 1024 * 1024 * 5, // 25 MBps = 125 MB per 5s window - fixed baseline
            suggestedMax: 25 * 1024 * 1024 * 5 // Ensure it stays at 25 MBps
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
    if (!chartInstance.current || !pieChartInstance.current) return

    // Handle case when there's no data - set default scale to 25 MBps
    if (!packets || packets.length === 0) {
      // Set default Y-axis scale when no data - fixed at 25 MBps
      if (chartInstance.current.options.scales?.y) {
        chartInstance.current.options.scales.y.max = 25 * 1024 * 1024 * 5 // 25 MBps (125 MB per 5s)
      }
      // Clear chart data
      chartInstance.current.data.labels = []
      chartInstance.current.data.datasets[0].data = []
      chartInstance.current.update('none') // Use 'none' mode to prevent animation
      return
    }

    const aggregatedData = aggregateBytesByTimeWindow(packets, 5000)
    const inboundSum = Array.from(registries[registries.length - 1].values()).reduce(
      (acc, registry) => acc + registry.inboundBytes,
      0
    )
    const outboundSum = Array.from(registries[registries.length - 1].values()).reduce(
      (acc, registry) => acc + registry.outboundBytes,
      0
    )

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

    // Update Y-axis max: fixed at 25 MBps baseline, expand only if data exceeds it
    // Y-axis shows rate (MBps), but data is stored as bytes per 5s window
    if (aggregatedData.length > 0 && chartInstance.current.options.scales?.y) {
      const currentMax = Math.max(...aggregatedData.map((d) => d.bytes))
      // 25 MBps = 25 * 1024 * 1024 bytes per second
      // For 5-second window: 25 MBps * 5 seconds = 125 MB = 125 * 1024 * 1024 bytes
      const fixedBaseline = 25 * 1024 * 1024 * 5 // 125 MB in bytes (25 MBps baseline)

      // If current max exceeds baseline, expand scale with 10% padding
      if (currentMax > fixedBaseline) {
        const paddedMax = currentMax * 1.1

        // Round up to nearest 5 MBps interval (5 MBps = 25 MB per 5s window)
        const mbps = paddedMax / (5 * 1024 * 1024) // Convert to MBps
        const roundedMbps = Math.ceil(mbps / 5) * 5 // Round to nearest 5 MBps
        const roundedMax = roundedMbps * 5 * 1024 * 1024 // Convert back to bytes per 5s

        chartInstance.current.options.scales.y.max = roundedMax
      } else {
        // Data is within baseline - use fixed 25 MBps (125 MB per 5s) scale
        chartInstance.current.options.scales.y.max = fixedBaseline
      }
    } else if (aggregatedData.length === 0 && chartInstance.current.options.scales?.y) {
      // No aggregated data - reset to fixed 25 MBps baseline
      chartInstance.current.options.scales.y.max = 25 * 1024 * 1024 * 5
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
