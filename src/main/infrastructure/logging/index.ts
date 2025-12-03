import pino from 'pino'
import { app } from 'electron'
import path from 'path'
import { isDevelopment } from '@shared/utils/environment'

// Create logger with appropriate configuration
const isDevMode = isDevelopment()

// Flag to track if logger is shutting down (worker thread ending)
let isLoggerShuttingDown = false

const pinoLogger = pino({
  level: isDevMode ? 'debug' : 'info',
  transport: isDevMode
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname'
        }
      }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label }
    }
  },
  base: {
    pid: process.pid,
    app: 'PrivacyRadar'
  }
})

// Helper function to normalize logger arguments
// Supports both: logger.info(msg, obj) and logger.info(obj, msg)
function createLogMethod(level: 'info' | 'warn' | 'error' | 'debug') {
  return (msgOrObj: string | object, objOrMsg?: object | string | unknown) => {
    // Don't log if logger is shutting down (worker thread is ending)
    if (isLoggerShuttingDown) {
      // Only allow critical errors during shutdown
      if (level === 'error') {
        console.error(msgOrObj, objOrMsg)
      }
      return
    }

    try {
      if (typeof msgOrObj === 'string') {
        // Pattern: logger.info('message', { data }) or logger.info('message', error)
        if (objOrMsg !== undefined) {
          if (typeof objOrMsg === 'object') {
            pinoLogger[level](objOrMsg, msgOrObj)
          } else {
            // Handle error or other types by wrapping in object
            pinoLogger[level]({ data: objOrMsg }, msgOrObj)
          }
        } else {
          pinoLogger[level](msgOrObj)
        }
      } else {
        // Pattern: logger.info({ data }, 'message')
        if (objOrMsg && typeof objOrMsg === 'string') {
          pinoLogger[level](msgOrObj, objOrMsg)
        } else {
          pinoLogger[level](msgOrObj)
        }
      }
    } catch (error) {
      // Fallback to console if pino worker has exited or is ending
      // This prevents crashes when the logger worker is unavailable (e.g., during shutdown)
      // Only log errors and warnings to console to avoid spam during normal shutdown
      if (level === 'error') {
        console.error(msgOrObj, objOrMsg)
      } else if (level === 'warn') {
        console.warn(msgOrObj, objOrMsg)
      }
      // Silently ignore info/debug logs if logger worker is unavailable
      // This is expected during app shutdown
    }
  }
}

/**
 * Gracefully shutdown the logger.
 * Call this before app cleanup to prevent "worker is ending" errors.
 * After calling this, all logging (except errors) will be silently ignored.
 */
export function shutdownLogger(): void {
  isLoggerShuttingDown = true
  // Give the worker a moment to flush any pending logs
  // The worker will be terminated by Node.js during process exit
}

// Export wrapped logger that supports flexible argument patterns
export const logger = {
  info: createLogMethod('info'),
  warn: createLogMethod('warn'),
  error: createLogMethod('error'),
  debug: createLogMethod('debug'),
  // Expose the underlying pino instance for advanced usage
  child: pinoLogger.child.bind(pinoLogger),
  // Expose shutdown method
  shutdown: shutdownLogger
}

export type Logger = typeof logger

// Log file path for production
if (!isDevMode) {
  const logDir = app.getPath('logs')
  const logFile = path.join(logDir, 'privacy-radar.log')
  logger.info('Logging to file in production', { logFile })
}
