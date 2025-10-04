import { eq } from 'drizzle-orm'
import { getDatabase, schema } from '../index'

export class SettingsService {
  private db = getDatabase()

  async getSetting(key: string): Promise<string | null> {
    const result = await this.db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, key))
      .limit(1)

    return result[0]?.value ?? null
  }

  async setSetting(key: string, value: string): Promise<void> {
    const existing = await this.getSetting(key)

    if (existing) {
      await this.db
        .update(schema.settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(schema.settings.key, key))
    } else {
      await this.db.insert(schema.settings).values({ key, value })
    }
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const results = await this.db.select().from(schema.settings)
    return Object.fromEntries(results.map((row) => [row.key, row.value]))
  }

  async deleteSetting(key: string): Promise<void> {
    await this.db.delete(schema.settings).where(eq(schema.settings.key, key))
  }
}
