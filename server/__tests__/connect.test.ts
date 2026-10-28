import { vi, describe, it, expect } from 'vitest'
import express from 'express'
import supertest from 'supertest'
import Stripe from 'stripe'

vi.mock('../storage', () => ({
  storage: {
    getTeam: vi.fn(async () => ({ id: 'team1', tournamentId: 't1', name: 'Boules Bros', feePaid: false })),
    getTournament: vi.fn(async () => ({ id: 't1', userId: 'org1' })),
    getUserById: vi.fn(async () => ({ id: 'org1', stripeConnectAccountId: 'acct_org', stripeConnectReady: true })),
    setTeamFeePaid: vi.fn(async () => ({})),
    getUserByConnectAccountId: vi.fn(),
    updateUserConnect: vi.fn(),
  },
}))

import { storage } from '../storage'
import { cardPayUrl, registerConnectRoutes } from '../connect'

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect'

function app() {
  const a = express()
  a.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf } }))
  registerConnectRoutes(a)
  return a
}
function signed(event: object) {
  const payload = JSON.stringify(event)
  return { payload, header: Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_connect' }) }
}

describe('card pay link', () => {
  it('is only offered when the organiser has finished Stripe sign-up', () => {
    expect(cardPayUrl({ stripeConnectAccountId: 'acct_x', stripeConnectReady: false }, 'team1', 'https://a')).toBeNull()
    expect(cardPayUrl({ stripeConnectAccountId: null, stripeConnectReady: false }, 'team1', 'https://a')).toBeNull()
    expect(cardPayUrl({ stripeConnectAccountId: 'acct_x', stripeConnectReady: true }, 'team1', 'https://a')).toMatch(/^https:\/\/a\/api\/public\/pay\/team1\./)
  })
})

describe('connected accounts webhook', () => {
  it('rejects a bad signature', async () => {
    const res = await supertest(app()).post('/api/stripe/connect-webhook').set('stripe-signature', 't=1,v1=bad').send({})
    expect(res.status).toBe(400)
  })
  it('marks the team paid when the payment is on the organiser\'s account', async () => {
    const { payload, header } = signed({ id: 'evt1', object: 'event', type: 'checkout.session.completed', account: 'acct_org',
      data: { object: { id: 'cs_1', object: 'checkout.session', payment_status: 'paid', metadata: { btm_team_id: 'team1' } } } })
    const res = await supertest(app()).post('/api/stripe/connect-webhook').set('stripe-signature', header).set('content-type', 'application/json').send(payload)
    expect(res.status).toBe(200)
    expect(storage.setTeamFeePaid).toHaveBeenCalledWith('team1', true, 'card')
  })
  it('ignores a payment made on someone else\'s account', async () => {
    vi.mocked(storage.setTeamFeePaid).mockClear()
    const { payload, header } = signed({ id: 'evt2', object: 'event', type: 'checkout.session.completed', account: 'acct_other',
      data: { object: { id: 'cs_2', object: 'checkout.session', payment_status: 'paid', metadata: { btm_team_id: 'team1' } } } })
    await supertest(app()).post('/api/stripe/connect-webhook').set('stripe-signature', header).set('content-type', 'application/json').send(payload)
    expect(storage.setTeamFeePaid).not.toHaveBeenCalled()
  })
})
