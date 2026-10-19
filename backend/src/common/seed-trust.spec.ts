import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('demo seed trust', () => {
  const seed = readFileSync(resolve(__dirname, '../../prisma/seed.ts'), 'utf8')
  const readme = readFileSync(resolve(__dirname, '../../../README.md'), 'utf8')

  it('does not set verified, backgroundCheck, rating, or reviewCount to a passing value', () => {
    expect(seed).not.toMatch(/verified:\s*true/)
    expect(seed).not.toMatch(/backgroundCheck:\s*true/)
    expect(seed).not.toMatch(/rating:\s*(?!null\b)\d/)
    expect(seed).not.toMatch(/reviewCount:\s*[1-9]/)
    expect(seed).toMatch(/verified:\s*false/)
    expect(seed).toMatch(/backgroundCheck:\s*false/)
    expect(seed).toMatch(/rating:\s*null/)
    expect(seed).toMatch(/reviewCount:\s*0/)
    expect(readme).toMatch(/never run in production/)
  })
})
