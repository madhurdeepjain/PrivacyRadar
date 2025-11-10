import { ApplicationRegistry, ProcessRegistry } from '@shared/interfaces/common'

// Serializable versions for JSON storage
export interface SerializableApplicationRegistry
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

export interface SerializableProcessRegistry
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

export class RegistrySerializer {
  static serializeAppRegistry(registry: ApplicationRegistry): SerializableApplicationRegistry {
    return {
      ...registry,
      uniqueRemoteIPs: Array.from(registry.uniqueRemoteIPs),
      uniqueDomains: Array.from(registry.uniqueDomains),
      interfaceStats: Object.fromEntries(registry.interfaceStats)
    }
  }

  static serializeProcessRegistry(registry: ProcessRegistry): SerializableProcessRegistry {
    return {
      ...registry,
      uniqueRemoteIPs: Array.from(registry.uniqueRemoteIPs),
      interfaceStats: Object.fromEntries(registry.interfaceStats)
    }
  }

  static deserializeAppRegistry(data: SerializableApplicationRegistry): ApplicationRegistry {
    return {
      ...data,
      uniqueRemoteIPs: new Set(data.uniqueRemoteIPs),
      uniqueDomains: new Set(data.uniqueDomains),
      interfaceStats: new Map(Object.entries(data.interfaceStats))
    }
  }

  static deserializeProcessRegistry(data: SerializableProcessRegistry): ProcessRegistry {
    return {
      ...data,
      uniqueRemoteIPs: new Set(data.uniqueRemoteIPs),
      interfaceStats: new Map(Object.entries(data.interfaceStats))
    }
  }

  static serializeAppRegistries(
    registries: Map<string, ApplicationRegistry>
  ): Record<string, SerializableApplicationRegistry> {
    const result: Record<string, SerializableApplicationRegistry> = {}
    registries.forEach((registry, key) => {
      result[key] = this.serializeAppRegistry(registry)
    })
    return result
  }

  static serializeProcessRegistries(
    registries: Map<string, ProcessRegistry>
  ): Record<string, SerializableProcessRegistry> {
    const result: Record<string, SerializableProcessRegistry> = {}
    registries.forEach((registry, key) => {
      result[key] = this.serializeProcessRegistry(registry)
    })
    return result
  }

  static deserializeAppRegistries(
    data: Record<string, SerializableApplicationRegistry>
  ): Map<string, ApplicationRegistry> {
    const map = new Map<string, ApplicationRegistry>()
    Object.entries(data).forEach(([key, value]) => {
      map.set(key, this.deserializeAppRegistry(value))
    })
    return map
  }

  static deserializeProcessRegistries(
    data: Record<string, SerializableProcessRegistry>
  ): Map<string, ProcessRegistry> {
    const map = new Map<string, ProcessRegistry>()
    Object.entries(data).forEach(([key, value]) => {
      map.set(key, this.deserializeProcessRegistry(value))
    })
    return map
  }
}
