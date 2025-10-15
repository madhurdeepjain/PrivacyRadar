import type { Config } from 'drizzle-kit'
import { join } from 'path'

export default {
  schema: './src/main/infrastructure/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: join(__dirname, '.dev-data', 'dev.db')
  }
} satisfies Config
