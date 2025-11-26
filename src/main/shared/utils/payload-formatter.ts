export class PayloadFormatter {
  //Converts hex string back to Buffer for processing
  private static hexToBuffer(hex: string): Buffer {
    return Buffer.from(hex, 'hex')
  }

  static toHexDump(hexPayload: string, bytesPerLine: number = 16): string {
    const payload = this.hexToBuffer(hexPayload)
    const lines: string[] = []

    for (let i = 0; i < payload.length; i += bytesPerLine) {
      const chunk = payload.slice(i, i + bytesPerLine)
      const offset = i.toString(16).padStart(4, '0')
      const hexBytes: string[] = []
      for (let j = 0; j < bytesPerLine; j++) {
        if (j < chunk.length) {
          hexBytes.push(chunk[j].toString(16).padStart(2, '0'))
        } else {
          hexBytes.push('  ')
        }
      }
      const hexLeft = hexBytes.slice(0, 8).join(' ')
      const hexRight = hexBytes.slice(8, 16).join(' ')
      const ascii = Array.from(chunk)
        .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'))
        .join('')

      lines.push(`${offset}  ${hexLeft}  ${hexRight}  ${ascii}`)
    }
    return lines.join('\n')
  }

  static toReadableText(hexPayload: string): string {
    const payload = this.hexToBuffer(hexPayload)
    return Array.from(payload)
      .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'))
      .join('')
  }

  static toUtf8(hexPayload: string): string {
    const payload = this.hexToBuffer(hexPayload)
    try {
      return payload.toString('utf8')
    } catch {
      return this.toReadableText(hexPayload)
    }
  }
}
