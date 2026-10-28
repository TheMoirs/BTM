import { describe, it, expect } from 'vitest'
import { planEmailHtml, planEmailSubject } from '../planEmail'

describe('plan welcome email', () => {
  it('free plan lists the limits and offers an upgrade through the plan page', () => {
    const html = planEmailHtml({ plan: 'free' }, 'Sam', 'https://ptm.example')
    expect(planEmailSubject({ plan: 'free' })).toMatch(/Free plan/)
    expect(html).toContain('Free plan')
    expect(html).toContain('Up to 10 teams')
    expect(html).toContain('UPGRADE TO UNLIMITED')
    expect(html).toContain('href="https://ptm.example/plan"')
    expect(html).toContain('Stripe')
    expect(html.toLowerCase()).not.toContain('paypal')
  })
  it('unlimited plan confirms the plan, price and renewal date', () => {
    const html = planEmailHtml({ plan: 'unlimited', interval: 'year', currency: 'eur', renewsAt: new Date('2027-10-28T12:00:00Z') }, null, 'https://ptm.example')
    expect(html).toContain('Unlimited, yearly')
    expect(html).toContain('€60 a year')
    expect(html).toContain('28 October 2027')
    expect(html).toContain('MANAGE YOUR PLAN')
  })
  it('escapes the name', () => {
    expect(planEmailHtml({ plan: 'free' }, '<b>x</b>', 'https://a')).toContain('Hi &lt;b&gt;x&lt;/b&gt;,')
  })
})
