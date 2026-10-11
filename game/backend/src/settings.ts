import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

const schema = z.object({ emailLoginEnabled: z.boolean() })
export type Settings = z.infer<typeof schema>

export class SettingsStore {
  private value: Settings = { emailLoginEnabled: false }
  private writes: Promise<void> = Promise.resolve()
  constructor(private readonly file: string) {}
  async load() {
    try {
      this.value = schema.parse(JSON.parse(await readFile(this.file, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  get(): Settings { return { ...this.value } }
  setEmailLoginEnabled(enabled: boolean): Promise<Settings> {
    const update = this.writes.then(async () => {
      const value = { emailLoginEnabled: enabled }
      await mkdir(path.dirname(this.file), { recursive: true })
      await writeFile(`${this.file}.tmp`, JSON.stringify(value) + '\n', { mode: 0o600 })
      await rename(`${this.file}.tmp`, this.file)
      this.value = value
      return this.get()
    })
    this.writes = update.then(() => {}, () => {})
    return update
  }
}
