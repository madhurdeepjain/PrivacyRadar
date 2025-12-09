import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ApplicationRegistry, GlobalRegistry, ProcessRegistry } from '@shared/interfaces/common'
import { logger } from '@infra/logging'

interface SerializableApplicationRegistry
  extends Omit<ApplicationRegistry, 'uniqueRemoteIPs' | 'uniqueDomains' | 'interfaceStats'> {
  uniqueRemoteIPs: string[]
  uniqueDomains: string[]
  interfaceStats: Record<
    string,
    {
      packets: number
      bytesSent: number
      bytesReceived: number
    }
  >
}

interface SerializableProcessRegistry
  extends Omit<ProcessRegistry, 'uniqueRemoteIPs' | 'interfaceStats'> {
  uniqueRemoteIPs: string[]
  interfaceStats: Record<
    string,
    {
      packets: number
      bytesSent: number
      bytesReceived: number
    }
  >
}

export class RegistryWriter {
  private readonly globalRegistryFile: string
  private readonly appRegistryFile: string
  private readonly processRegistryFile: string
  private isFirstGlobal = true
  private isFirstApp = true
  private isFirstProcess = true

  constructor(basePath: string) {
    if (!existsSync(basePath)) {
      mkdirSync(basePath, { recursive: true })
    }

    this.globalRegistryFile = join(basePath, 'global_registry.json')
    this.appRegistryFile = join(basePath, 'app_registry.json')
    this.processRegistryFile = join(basePath, 'process_registry.json')

    writeFileSync(this.globalRegistryFile, '[\n')
    writeFileSync(this.appRegistryFile, '[\n')
    writeFileSync(this.processRegistryFile, '[\n')
  }

  writeRegistries(
    globalRegistry: Map<string, GlobalRegistry>,
    appRegistries: Map<string, ApplicationRegistry>,
    processRegistries: Map<string, ProcessRegistry>
  ): void {
    try {
      this.writeGlobalRegistry(globalRegistry)
      this.writeAppRegistries(appRegistries)
      this.writeProcessRegistries(processRegistries)
    } catch (error) {
      logger.error('Failed to write registries', error)
    }
  }

  private appendSnapshot(
    filePath: string,
    snapshot: unknown,
    isFirstRef: { value: boolean }
  ): void {
    const prefix = isFirstRef.value ? '  ' : ',\n  '
    isFirstRef.value = false
    appendFileSync(filePath, prefix + JSON.stringify(snapshot, null, 2).split('\n').join('\n  '))
  }

  private writeGlobalRegistry(registry: Map<string, GlobalRegistry>): void {
    this.appendSnapshot(
      this.globalRegistryFile,
      {
        timestamp: Date.now(),
        interfaces: Array.from(registry.values())
      },
      { value: this.isFirstGlobal }
    )
    this.isFirstGlobal = false
  }

  private writeAppRegistries(registries: Map<string, ApplicationRegistry>): void {
    this.appendSnapshot(
      this.appRegistryFile,
      {
        timestamp: Date.now(),
        count: registries.size,
        applications: Array.from(registries.values()).map((reg) => this.serializeAppRegistry(reg))
      },
      { value: this.isFirstApp }
    )
    this.isFirstApp = false
  }

  private writeProcessRegistries(registries: Map<string, ProcessRegistry>): void {
    this.appendSnapshot(
      this.processRegistryFile,
      {
        timestamp: Date.now(),
        count: registries.size,
        processes: Array.from(registries.values()).map((reg) => this.serializeProcessRegistry(reg))
      },
      { value: this.isFirstProcess }
    )
    this.isFirstProcess = false
  }

  private serializeAppRegistry(registry: ApplicationRegistry): SerializableApplicationRegistry {
    return {
      ...registry,
      uniqueRemoteIPs: Array.from(registry.uniqueRemoteIPs),
      uniqueDomains: Array.from(registry.uniqueDomains),
      interfaceStats: Object.fromEntries(registry.interfaceStats)
    }
  }

  private serializeProcessRegistry(registry: ProcessRegistry): SerializableProcessRegistry {
    return {
      ...registry,
      uniqueRemoteIPs: Array.from(registry.uniqueRemoteIPs),
      interfaceStats: Object.fromEntries(registry.interfaceStats)
    }
  }

  close(): void {
    try {
      appendFileSync(this.globalRegistryFile, '\n]\n')
      appendFileSync(this.appRegistryFile, '\n]\n')
      appendFileSync(this.processRegistryFile, '\n]\n')
      logger.info('Registry files closed successfully')
    } catch (error) {
      logger.error('Failed to close registry files', error)
    }
  }
}
