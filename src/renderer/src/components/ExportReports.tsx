import { CardContent, CardHeader, Card, CardTitle } from './ui/card'
import { useState } from 'react'
import { Button } from './ui/button'
import Excel from 'exceljs'
import FileSaver from 'file-saver'
import { Bounce, ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { Database, Download, MoveRight } from 'lucide-react'

async function exportReports(
  table: 'global_snapshots' | 'application_snapshots' | 'process_snapshots',
  limit: number,
  offset: number
): Promise<void> {
  const toastId = toast.loading('Report export started...')
  const [result_set, error_message] = await window.api.queryDatabase({
    table,
    limit,
    offset
  })
  if (result_set.length > 0 && !error_message) {
    const workbook = new Excel.Workbook()
    const worksheet = workbook.addWorksheet('Data Export')
    const columns: { header: string; key: string; width: number }[] = []
    const rows = result_set as Record<string, unknown>[]
    if (rows.length > 0 && rows[0] && typeof rows[0] === 'object') {
      for (const key of Object.keys(rows[0])) {
        columns.push({ header: key, key: key, width: 20 })
      }
    }
    worksheet.columns = columns
    for (const row of rows) {
      worksheet.addRow(row as Record<string, unknown>)
    }
    toast.dismiss(toastId)
    workbook.xlsx
      .writeBuffer()
      .then((buffer) => FileSaver.saveAs(new Blob([buffer]), `${Date.now()}_Export.xlsx`))
      .catch((err) => {
        console.error('Error writing excel export', err)
      })
  } else if (!error_message && result_set.length === 0) {
    toast.update(toastId, {
      render: 'No data found for the given query.',
      type: 'info',
      isLoading: false,
      autoClose: 1000
    })
  } else if (error_message) {
    toast.dismiss(toastId)
    toast.error(error_message)
  }
}

function ExportReports({ darkMode }: { darkMode: boolean }): React.JSX.Element {
  const [table, setTable] = useState<
    'global_snapshots' | 'application_snapshots' | 'process_snapshots'
  >('application_snapshots')
  const [limit, setLimit] = useState(1000)
  const [offset, setOffset] = useState(0)

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Database className="h-5 w-5" />
          <MoveRight className="h-5 w-5" />
          <Download className="h-5 w-5" />
          <CardTitle className="flex items-center gap-2">Export Report</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto no-scrollbar pr-2">
        <div className="w-full mb-4 border border-default-medium rounded-base bg-neutral-secondary-medium shadow-xs">
          <div className="px-4 py-2 bg-neutral-secondary-medium rounded-t-base space-y-3">
            <div>
              <label htmlFor="table" className="block text-sm font-medium mb-1">
                Table
              </label>
              <select
                id="table"
                className="block w-full px-3 py-2 text-sm border border-default-medium rounded-base bg-neutral-secondary-medium"
                value={table}
                onChange={(e) => setTable(e.target.value as typeof table)}
              >
                <option value="global_snapshots">Global Snapshots</option>
                <option value="application_snapshots">Application Snapshots</option>
                <option value="process_snapshots">Process Snapshots</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="limit" className="block text-sm font-medium mb-1">
                  Limit
                </label>
                <input
                  id="limit"
                  type="number"
                  min="1"
                  max="10000"
                  className="block w-full px-3 py-2 text-sm border border-default-medium rounded-base bg-neutral-secondary-medium"
                  value={limit}
                  onChange={(e) => setLimit(Number.parseInt(e.target.value) || 1000)}
                />
              </div>
              <div>
                <label htmlFor="offset" className="block text-sm font-medium mb-1">
                  Offset
                </label>
                <input
                  id="offset"
                  type="number"
                  min="0"
                  className="block w-full px-3 py-2 text-sm border border-default-medium rounded-base bg-neutral-secondary-medium"
                  value={offset}
                  onChange={(e) => setOffset(Number.parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end px-3 py-3 border-t border-default-medium">
            <Button variant="outline" size="sm" onClick={() => exportReports(table, limit, offset)}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </CardContent>
      <ToastContainer
        position="top-right"
        autoClose={false}
        hideProgressBar
        newestOnTop={false}
        closeOnClick
        rtl={false}
        draggable
        theme={darkMode ? 'light' : 'dark'}
        transition={Bounce}
      />
    </Card>
  )
}

export default ExportReports
