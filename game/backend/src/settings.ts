export type Settings = { emailLoginEnabled: boolean }

export class SettingsStore {
  private value: Settings = { emailLoginEnabled: false }

  get(): Settings { return { ...this.value } }

  async setEmailLoginEnabled(enabled: boolean): Promise<Settings> {
    this.value = { emailLoginEnabled: enabled }
    return this.get()
  }
}
