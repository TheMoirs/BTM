import { vi, describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import supertest from 'supertest'
import Stripe from 'stripe'

vi.mock('../storage', () => ({
  storage: {
    getUserById: vi.fn(),
    getTournamentsByUserId: vi.fn(),
    countTeams: vi.fn(),
    getUserByStripeCustomerId: vi.fn(),
    updateUserBilling: vi.fn(),
  },
}))

import { storage } from '../storage'
import { teamLimitProblem, tournamentLimitProblem, transferLimitProblem, hasUnlimited, registerBillingRoutes } from '../billing'

const s = storage as unknown as Record<string, ReturnType<typeof vi.fn>>

const freeUser = { id: 'u1', email: 'someone@example.com', isSystemAdmin: false, subscriptionStatus: null, isBlocked: false }
const paidUser = { ...freeUser, id: 'u2', subscriptionStatus: 'active' }
const adminUser = { ...freeUser, id: 'u3', email: 'ali@themoirs.co.uk', isSystemAdmin: true }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('plan status', () => {
  it('treats active, trialing and past_due as unlimited', () => {
    for (const st of ['active', 'trialing', 'past_due']) expect(hasUnlimited({ ...freeUser, subscriptionStatus: st })).toBe(true)
    for (const st of ['canceled', 'unpaid', 'incomplete', null]) expect(hasUnlimited({ ...freeUser, subscriptionStatus: st })).toBe(false)
  })
  it('system admins are always unlimited', () => {
    expect(hasUnlimited(adminUser)).toBe(true)
  })
})

describe('tournament limit', () => {
  it('lets a free user create their first tournament', async () => {
    s.getUserById.mockResolvedValue(freeUser)
    s.getTournamentsByUserId.mockResolvedValue([])
    expect(await tournamentLimitProblem('u1')).toBeNull()
  })
  it('stops a free user creating a second tournament', async () => {
    s.getUserById.mockResolvedValue(freeUser)
    s.getTournamentsByUserId.mockResolvedValue([{ id: 't1' }])
    expect(await tournamentLimitProblem('u1')).toMatchObject({ code: 'plan_limit' })
  })
  it('lets a paying user create more', async () => {
    s.getUserById.mockResolvedValue(paidUser)
    s.getTournamentsByUserId.mockResolvedValue([{ id: 't1' }, { id: 't2' }])
    expect(await tournamentLimitProblem('u2')).toBeNull()
  })
})

describe('team limit', () => {
  const tournament = { id: 't1', userId: 'u1' }
  it('allows the 10th team on the free plan', async () => {
    s.getUserById.mockResolvedValue(freeUser)
    s.countTeams.mockResolvedValue(9)
    expect(await teamLimitProblem(tournament)).toBeNull()
  })
  it('blocks the 11th team on the free plan', async () => {
    s.getUserById.mockResolvedValue(freeUser)
    s.countTeams.mockResolvedValue(10)
    expect(await teamLimitProblem(tournament)).toMatchObject({ code: 'plan_limit' })
  })
  it('gives captains a "tournament is full" message', async () => {
    s.getUserById.mockResolvedValue(freeUser)
    s.countTeams.mockResolvedValue(10)
    const p = await teamLimitProblem(tournament, 1, true)
    expect(p?.error).toMatch(/full/)
  })
  it('has no team limit for paying users', async () => {
    s.getUserById.mockResolvedValue(paidUser)
    s.countTeams.mockResolvedValue(200)
    expect(await teamLimitProblem({ id: 't1', userId: 'u2' })).toBeNull()
  })
  it('ignores tournaments with no owner', async () => {
    expect(await teamLimitProblem({ id: 't1', userId: null })).toBeNull()
  })
})

describe('transfer limit', () => {
  it('blocks transferring a tournament with more than 10 teams to a free user', async () => {
    s.getUserById.mockResolvedValue(freeUser)
    s.countTeams.mockResolvedValue(11)
    s.getTournamentsByUserId.mockResolvedValue([])
    expect((await transferLimitProblem('u1', 't9'))?.error).toMatch(/11 teams/)
  })
  it('allows a 10-team tournament to a free user with no tournament', async () => {
    s.getUserById.mockResolvedValue(freeUser)
    s.countTeams.mockResolvedValue(10)
    s.getTournamentsByUserId.mockResolvedValue([])
    expect(await transferLimitProblem('u1', 't9')).toBeNull()
  })
  it('blocks a free user who already has a tournament', async () => {
    s.getUserById.mockResolvedValue(freeUser)
    s.countTeams.mockResolvedValue(3)
    s.getTournamentsByUserId.mockResolvedValue([{ id: 't1' }])
    expect(await transferLimitProblem('u1', 't9')).toMatchObject({ code: 'plan_limit' })
  })
  it('allows any size to a paying user', async () => {
    s.getUserById.mockResolvedValue(paidUser)
    s.countTeams.mockResolvedValue(80)
    expect(await transferLimitProblem('u2', 't9')).toBeNull()
  })
})

describe('webhook', () => {
  const secret = 'whsec_test_secret'
  function app() {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
    process.env.STRIPE_WEBHOOK_SECRET = secret
    const a = express()
    a.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf } }))
    registerBillingRoutes(a)
    return a
  }

  it('rejects a request without a valid Stripe signature', async () => {
    const res = await supertest(app())
      .post('/api/stripe/webhook')
      .set('stripe-signature', 't=1,v1=bad')
      .send({ type: 'customer.subscription.updated' })
    expect(res.status).toBe(400)
  })

  it('accepts a correctly signed event it does not need to act on', async () => {
    const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'invoice.created', data: { object: {} } })
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret })
    const res = await supertest(app())
      .post('/api/stripe/webhook')
      .set('stripe-signature', header)
      .set('content-type', 'application/json')
      .send(payload)
    expect(res.status).toBe(200)
  })
})
