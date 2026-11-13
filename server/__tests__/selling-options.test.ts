import { describe, it, expect } from 'vitest'
import { normaliseSellingOptions, sellingOptionsProblems, formatAmount, enabledPaidOptions, DEFAULT_SELLING_OPTIONS } from '@shared/plans'

const valid = {
  free: { enabled: true },
  month: { enabled: true, amounts: { gbp: 500, eur: 600, usd: 700 } },
  year: { enabled: false, amounts: { gbp: 5000, eur: 6000, usd: 7000 } },
  once: { enabled: true, amounts: { gbp: 5000, eur: 6000, usd: 7000 } },
}

describe('selling options', () => {
  it('defaults to Free and a one-off £50 / €60 / $70', () => {
    const d = normaliseSellingOptions(null)
    expect(d).toEqual(DEFAULT_SELLING_OPTIONS)
    expect(enabledPaidOptions(d)).toEqual(['once'])
    expect(d.once.amounts).toEqual({ gbp: 5000, eur: 6000, usd: 7000 })
  })
  it('keeps saved choices and fills in anything missing', () => {
    const s = normaliseSellingOptions({ free: { enabled: false }, month: { enabled: true, amounts: { gbp: 450 } } })
    expect(s.free.enabled).toBe(false)
    expect(s.month).toEqual({ enabled: true, amounts: { gbp: 450, eur: 600, usd: 700 } })
  })
  it('accepts a valid set', () => {
    expect(sellingOptionsProblems(valid)).toEqual([])
  })
  it('needs at least one option on', () => {
    const off = { free: { enabled: false }, month: { ...valid.month, enabled: false }, year: valid.year, once: { ...valid.once, enabled: false } }
    expect(sellingOptionsProblems(off).join(' ')).toMatch(/At least one/)
  })
  it('rejects prices below Stripe\'s minimum or not whole pence', () => {
    expect(sellingOptionsProblems({ ...valid, once: { enabled: true, amounts: { gbp: 10, eur: 6000, usd: 7000 } } }).length).toBe(1)
    expect(sellingOptionsProblems({ ...valid, once: { enabled: true, amounts: { gbp: 50.5, eur: 6000, usd: 7000 } } }).length).toBe(1)
  })
  it('formats amounts', () => {
    expect(formatAmount(5000, 'gbp')).toBe('£50')
    expect(formatAmount(450, 'eur')).toBe('€4.50')
    expect(formatAmount(7000, 'usd')).toBe('$70')
  })
})
