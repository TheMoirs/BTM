import { vi, describe, it, expect } from 'vitest'

// The email reads the selling options from the database when sending; not needed here
vi.mock('../selling', () => ({ getSellingOptions: vi.fn() }))

import { planEmailHtml, planEmailSubject } from '../planEmail'

describe('plan welcome email', () => {
  it('free plan lists the limits and offers an upgrade through the plan page', () => {
    const html = planEmailHtml({ plan: 'free' }, 'Sam', 'https://ptm.example')
    expect(planEmailSubject({ plan: 'free' })).toMatch(/Free plan/)
    expect(html).toContain('Free plan')
    expect(html).toContain('Up to 20 teams')
    expect(html).toContain('UPGRADE TO UNLIMITED')
    expect(html).toContain('href="https://ptm.example/plan"')
    // The logo links to the public home page
    expect(html).toContain('<a href="https://ptm.example/home/" title="PTM home page"><img src="https://ptm.example/ptm-logo.png')
    expect(html).toContain('Stripe')
    expect(html.toLowerCase()).not.toContain('paypal')
  })
  it('unlimited plan confirms the plan, price and renewal date', () => {
    const html = planEmailHtml({ plan: 'unlimited', option: 'year', currency: 'eur', renewsAt: new Date('2027-10-28T12:00:00Z') }, null, 'https://ptm.example')
    expect(html).toContain('Unlimited, yearly')
    expect(html).toContain('€60 a year')
    expect(html).toContain('28 October 2027')
    expect(html).toContain('MANAGE YOUR PLAN')
  })
  it('one-off plan says there is no end date', () => {
    const html = planEmailHtml({ plan: 'unlimited', option: 'once', currency: 'usd', renewsAt: null }, null, 'https://ptm.example')
    expect(html).toContain('Unlimited, one-off payment')
    expect(html).toContain('$70, paid once (no end date)')
    expect(html).toContain('no end date')
  })
  it('free plan email only offers what is on sale', () => {
    const html = planEmailHtml({ plan: 'free' }, null, 'https://ptm.example')
    expect(html).toContain('£50 once')
    expect(html).not.toContain('a month')
  })
  it('escapes the name', () => {
    expect(planEmailHtml({ plan: 'free' }, '<b>x</b>', 'https://a')).toContain('Hi &lt;b&gt;x&lt;/b&gt;,')
  })
})
