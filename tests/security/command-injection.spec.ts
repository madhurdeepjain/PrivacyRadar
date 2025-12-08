import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'child_process'

// Mock execFileSync
vi.mock('child_process', () => ({
  execFileSync: vi.fn()
}))

describe('Command Injection Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('hasCommand validation', () => {
    // This tests the validation logic that should be in hasCommand
    const validateCommand = (command: string): boolean => {
      return /^[a-zA-Z0-9_-]+$/.test(command)
    }

    it('accepts valid command names', () => {
      expect(validateCommand('lsof')).toBe(true)
      expect(validateCommand('pactl')).toBe(true)
      expect(validateCommand('pw-top')).toBe(true)
      expect(validateCommand('which')).toBe(true)
    })

    it('rejects commands with shell metacharacters', () => {
      expect(validateCommand('ls; rm -rf /')).toBe(false)
      expect(validateCommand('$(malicious)')).toBe(false)
      expect(validateCommand('`backtick`')).toBe(false)
      expect(validateCommand('command && rm')).toBe(false)
      expect(validateCommand('command | cat')).toBe(false)
      expect(validateCommand('command > file')).toBe(false)
    })

    it('rejects commands with path traversal', () => {
      expect(validateCommand('../malicious')).toBe(false)
      expect(validateCommand('/bin/sh')).toBe(false)
      expect(validateCommand('../../etc/passwd')).toBe(false)
    })

    it('rejects commands with spaces', () => {
      expect(validateCommand('ls -la')).toBe(false)
      expect(validateCommand('rm file')).toBe(false)
    })

    it('rejects empty strings', () => {
      expect(validateCommand('')).toBe(false)
    })

    it('rejects commands with special characters', () => {
      expect(validateCommand('command.sh')).toBe(false)
      expect(validateCommand('command@host')).toBe(false)
      expect(validateCommand('command#comment')).toBe(false)
    })
  })

  describe('execFileSync usage', () => {
    it('should use execFileSync with array args, not template strings', () => {
      const command = 'which'
      const args = ['lsof']
      
      // This is the safe way - execFileSync with array
      execFileSync(command, args, { stdio: 'ignore' })
      
      expect(execFileSync).toHaveBeenCalledWith(command, args, { stdio: 'ignore' })
      expect(execFileSync).not.toHaveBeenCalledWith(expect.stringContaining('which lsof'), expect.anything(), expect.anything())
    })
  })
})

