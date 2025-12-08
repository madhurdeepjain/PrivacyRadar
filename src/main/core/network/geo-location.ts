import { logger } from '@infra/logging'
import { GeoLocationResponse, GeoLocationData } from '@shared/interfaces/common'

export class GeoLocationService {
  private locationCache: Map<string, GeoLocationData>
  private pendingRequests: Map<string, Promise<GeoLocationData>>
  private requestQueue: string[]
  private isProcessingQueue: boolean
  private readonly API_URL = 'http://ip-api.com/json'
  private readonly FIELDS =
    'country,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,mobile,proxy,hosting'
  private readonly RATE_LIMIT_DELAY = 700
  private readonly BATCH_SIZE = 10
  private readonly IPIFY_URL = 'https://api.ipify.org/?format=json'

  constructor() {
    this.locationCache = new Map()
    this.pendingRequests = new Map()
    this.requestQueue = []
    this.isProcessingQueue = false
  }

  async getPublicIP(): Promise<string> {
    try {
      const response = await fetch(this.IPIFY_URL)

      if (!response.ok) {
        logger.warn(`IPIFY-API request failed for public IP: ${response.status}`)
        return ''
      }

      const apiData = await response.json()
      return apiData.ip
    } catch (error) {
      logger.error(`GeoIP lookup error for public IP:`, error)
      return ''
    }
  }

  async lookup(ip: string): Promise<GeoLocationData> {
    const cached = this.locationCache.get(ip)
    if (cached) return cached

    const pending = this.pendingRequests.get(ip)
    if (pending) return pending

    const requestPromise = this.queueLookup(ip)
    this.pendingRequests.set(ip, requestPromise)

    try {
      const result = await requestPromise
      return result
    } finally {
      this.pendingRequests.delete(ip)
    }
  }

  private async queueLookup(ip: string): Promise<GeoLocationData> {
    return new Promise((resolve) => {
      this.requestQueue.push(ip)

      const checkInterval = setInterval(() => {
        const cached = this.locationCache.get(ip)
        if (cached) {
          clearInterval(checkInterval)
          resolve(cached)
        }
      }, 100)

      if (!this.isProcessingQueue) {
        this.processQueue()
      }

      setTimeout(() => {
        clearInterval(checkInterval)
        const cached = this.locationCache.get(ip)
        resolve(cached || this.createEmptyGeoData())
      }, 30000)
    })
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return
    }

    this.isProcessingQueue = true

    while (this.requestQueue.length > 0) {
      const batch = this.requestQueue.splice(0, this.BATCH_SIZE)

      await Promise.all(batch.map((ip) => this.performLookup(ip)))

      if (this.requestQueue.length > 0) {
        await this.sleep(this.RATE_LIMIT_DELAY)
      }
    }

    this.isProcessingQueue = false
  }

  private async performLookup(ip: string): Promise<GeoLocationData> {
    try {
      const url = `${this.API_URL}/${ip}?fields=${this.FIELDS}`
      const response = await fetch(url)

      if (!response.ok) {
        logger.warn(`IP-API request failed for ${ip}: ${response.status}`)
        return this.cacheEmptyResult(ip)
      }

      const apiData: GeoLocationResponse = await response.json()
      const geoData = this.convertToGeoLocationData(apiData)
      this.locationCache.set(ip, geoData)
      return geoData
    } catch (error) {
      logger.error(`GeoIP lookup error for ${ip}:`, error)
      return this.cacheEmptyResult(ip)
    }
  }

  private convertToGeoLocationData(apiData: GeoLocationResponse): GeoLocationData {
    let asStr = apiData.as
    let asnOrg = apiData.asname || apiData.org

    if (apiData.as) {
      const match = apiData.as.match(/^AS(\d+)\s*(.*)$/)
      if (match) {
        asStr = match[1]
        asnOrg = match[2].trim() || asnOrg
      }
    }

    return {
      country: apiData.country,
      region: apiData.region,
      regionName: apiData.regionName,
      city: apiData.city,
      zip: apiData.zip,
      lat: apiData.lat,
      lon: apiData.lon,
      timezone: apiData.timezone,
      isp: apiData.isp,
      org: apiData.org,
      as: asStr,
      asname: asnOrg,
      mobile: apiData.mobile,
      proxy: apiData.proxy,
      hosting: apiData.hosting,
      ips: [],
      packetCount: 0,
      bytesSent: 0,
      bytesReceived: 0
    }
  }

  private createEmptyGeoData(): GeoLocationData {
    return {
      ips: [],
      packetCount: 0,
      bytesSent: 0,
      bytesReceived: 0
    }
  }

  private cacheEmptyResult(ip: string): GeoLocationData {
    const emptyResult = this.createEmptyGeoData()
    this.locationCache.set(ip, emptyResult)
    return emptyResult
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  clearCache(): void {
    this.locationCache.clear()
    logger.debug('GeoLocation cache cleared')
  }

  getCacheSize(): number {
    return this.locationCache.size
  }

  getQueueSize(): number {
    return this.requestQueue.length
  }

  async close(): Promise<void> {
    while (this.isProcessingQueue || this.requestQueue.length > 0) {
      await this.sleep(100)
    }

    this.locationCache.clear()
    this.pendingRequests.clear()
    this.requestQueue = []
    logger.info('GeoLocationService closed')
  }
}
