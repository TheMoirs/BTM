import { describe, it, expect, beforeEach } from 'vitest'
import Stripe from 'stripe'
import { keyFor, modeAvailable, defaultMode, constructEventAnyMode, dashboardUrl } from '../stripeModes'

const KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_TEST_SECRET_KEY', 'STRIPE_LIVE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET_TEST', 'STRIPE_WEBHOOK_SECRET_LIVE']
beforeEach(() => { for (const k of KEYS) delete process.env[k] })

describe('stripe modes', () => {
  it('treats the older single key as test or live by its prefix', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc'
    expect(keyFor('test')).toBe('sk_test_abc')
    expect(modeAvailable('live')).toBe(false)
    expect(defaultMode()).toBe('test')
  })
  it('uses separate keys when both are set, and defaults to live', () => {
    process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_1'
    process.env.STRIPE_LIVE_SECRET_KEY = 'sk_live_1'
    expect(keyFor('test')).toBe('sk_test_1')
    expect(keyFor('live')).toBe('sk_live_1')
    expect(defaultMode()).toBe('live')
  })
  it('accepts a webhook signed with either mode\'s secret', () => {
    process.env.STRIPE_WEBHOOK_SECRET_TEST = 'whsec_t'
    process.env.STRIPE_WEBHOOK_SECRET_LIVE = 'whsec_l'
    const payload = JSON.stringify({ id: 'evt', object: 'event', type: 'x', livemode: true, data: { object: {} } })
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_l' })
    expect(constructEventAnyMode('account', Buffer.from(payload), header)?.mode).toBe('live')
    expect(constructEventAnyMode('account', Buffer.from(payload), 't=1,v1=bad')).toBeNull()
  })
  it('links to the right dashboard', () => {
    expect(dashboardUrl('test', 'customers/cus_1')).toBe('https://dashboard.stripe.com/test/customers/cus_1')
    expect(dashboardUrl('live', 'customers/cus_1')).toBe('https://dashboard.stripe.com/customers/cus_1')
  })
})
