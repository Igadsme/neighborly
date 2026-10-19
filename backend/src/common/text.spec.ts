import { cleanList, cleanText, sanitizeText } from './text'

describe('sanitizeText', () => {
  it('strips markup and control characters and trims', () => {
    expect(sanitizeText('  <b>Hello</b>\u0000 neighbor  ')).toBe('Hello neighbor')
    expect(sanitizeText('<script>alert(1)</script>')).toBe('alert(1)')
    expect(cleanText('   ')).toBeNull()
    expect(cleanText(undefined)).toBeUndefined()
    expect(cleanList([' <i>tools</i> ', '  ', 'garden'])).toEqual(['tools', 'garden'])
  })

  it('caps stored length', () => {
    expect(sanitizeText('abcdef', 3)).toBe('abc')
  })
})
