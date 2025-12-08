import { CardContent, CardHeader, Card, CardTitle } from './ui/card'
import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import Excel from 'exceljs'
import FileSaver from 'file-saver'
import { Bounce, ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { Database, Download, MoveRight } from 'lucide-react'

async function fetchTables(
  setTables: React.Dispatch<React.SetStateAction<string[]>>
): Promise<void> {
  console.log('Fetching table names from database...')
  const [tableNames, error_message] = await window.api.queryDatabase(
    "SELECT name FROM sqlite_master WHERE type='table'"
  )
  console.log('Received table names:', tableNames, 'Error message:', error_message)
  if (!error_message && Array.isArray(tableNames)) {
    setTables((tableNames as { name: string }[]).map((table) => table.name))
  }
}

async function exportReports(sqlQuery: string): Promise<void> {
  if (!sqlQuery || sqlQuery.trim() === '') {
    toast.error('Please enter a valid SQL query.')
  } else {
    const toastId = toast.loading('Report export started...')
    const [result_set, error_message] = await window.api.queryDatabase(sqlQuery)
    if (result_set.length > 0 && !error_message) {
      const workbook = new Excel.Workbook()
      const worksheet = workbook.addWorksheet('Data Export')
      const columns: { header: string; key: string; width: number }[] = []
      // Cast the result to a known shape so Object.keys accepts it
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
          // Error handling - could use proper logging in production
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
}
function ExportReports({ darkMode }: { darkMode: boolean }): React.JSX.Element {
  const [inputValue, setInputValue] = useState('')
  const [tables, setTables] = useState(Array<string>())

  useEffect(() => {
    fetchTables(setTables)
  }, [])

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
          <div className="px-4 py-2 bg-neutral-secondary-medium rounded-t-base">
            <textarea
              title={tables.join('\n')}
              id="comment"
              className="block w-full px-0 text-sm text-heading bg-neutral-secondary-medium border-0 focus:ring-0"
              placeholder="Enter your query here..."
              required
              onChange={(e) => setInputValue(e.target.value)}
            ></textarea>
          </div>
          <div className="flex items-center justify-end px-3 py-3 border-t border-default-medium">
            <Button variant="outline" size="sm" onClick={() => exportReports(inputValue)}>
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
