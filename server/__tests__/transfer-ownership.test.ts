import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import supertest from 'supertest'
import type { Express } from 'express'

vi.mock('../storage', () => ({
  storage: {
    getUserById: vi.fn(),
    getTournament: vi.fn(),
    getUserByEmail: vi.fn(),
    transferTournamentOwnership: vi.fn(),
    getTournamentByToken: vi.fn(),
    getTournamentsByUserId: vi.fn(),
    getAllTournaments: vi.fn(),
    getLatestTournament: vi.fn(),
    getShortLinkByCode: vi.fn(),
    createShortLink: vi.fn(),
    getShortLinkForTournament: vi.fn(),
  },
}))

vi.mock('../resend', () => ({
  getUncachableResendClient: vi.fn(async () => ({
    client: { emails: { send: vi.fn() } },
    fromEmail: 'no-reply@test.com',
  })),
}))

import { storage } from '../storage'
import { createAuthToken } from '../sessionAuth'
import { registerRoutes } from '../routes'

const TOURNAMENT_ID = 'tourn-aaa-111'
const OWNER_ID = 'user-owner-aaa'
const NON_OWNER_ID = 'user-other-bbb'

const mockTournament = {
  id: TOURNAMENT_ID,
  name: 'Test Tournament',
  userId: OWNER_ID,
  adminToken: 'admin-tok-aaa',
  viewToken: 'view-tok-xxx',
  description: null,
  numDivisions: 2,
  gamesPerMatch: 3,
  winPoints: 2,
  drawPoints: 1,
  lossPoints: 0,
  stages: ['initial'],
  createdAt: new Date().toISOString(),
}

const ownerUser = {
  id: OWNER_ID,
  email: 'owner@example.com',
  passwordHash: '$2b$12$placeholder',
  displayName: 'Owner',
  isSystemAdmin: false,
  isBlocked: false,
  createdAt: new Date().toISOString(),
}

const sysAdminUser = {
  id: 'sysadmin-id-ccc',
  email: 'sysadmin@example.com',
  passwordHash: '$2b$12$placeholder',
  displayName: 'SysAdmin',
  isSystemAdmin: true,
  isBlocked: false,
  createdAt: new Date().toISOString(),
}

const nonOwnerUser = {
  id: NON_OWNER_ID,
  email: 'other@example.com',
  passwordHash: '$2b$12$placeholder',
  displayName: 'Other',
  isSystemAdmin: false,
  isBlocked: false,
  createdAt: new Date().toISOString(),
}

const targetUser = {
  id: 'target-user-ddd',
  email: 'target@example.com',
  passwordHash: '$2b$12$placeholder',
  displayName: 'Target',
  isSystemAdmin: false,
  isBlocked: false,
  createdAt: new Date().toISOString(),
}

function makeAuthCookie(payload: {
  userId: string
  email: string
  displayName: string | null
  isSystemAdmin: boolean
}): string {
  return `btm_auth=${createAuthToken(payload)}`
}

describe('PATCH /api/tournaments/:id/transfer – ownership transfer access control', () => {
  let app: Express

  beforeAll(async () => {
    app = express()
    app.use(cookieParser())
    app.use(express.json())
    await registerRoutes(app)
  })

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(storage.getTournament).mockResolvedValue(mockTournament as any)
    vi.mocked(storage.getUserByEmail).mockResolvedValue(targetUser as any)
    vi.mocked(storage.transferTournamentOwnership).mockResolvedValue({
      ...mockTournament,
      userId: targetUser.id,
    } as any)
    vi.mocked(storage.getTournamentByToken).mockResolvedValue(undefined)
    vi.mocked(storage.getTournamentsByUserId).mockResolvedValue([])
    vi.mocked(storage.getAllTournaments).mockResolvedValue([])
    vi.mocked(storage.getLatestTournament).mockResolvedValue(undefined)
    vi.mocked(storage.getShortLinkByCode).mockResolvedValue(undefined)
  })

  it('anonymous request is rejected with 403', async () => {
    const res = await supertest(app)
      .patch(`/api/tournaments/${TOURNAMENT_ID}/transfer`)
      .send({ email: 'target@example.com' })

    expect(res.status).toBe(403)
  })

  it('view-token holder is rejected with 403', async () => {
    vi.mocked(storage.getTournamentByToken).mockResolvedValue({
      tournament: mockTournament as any,
      isAdmin: false,
    })

    const res = await supertest(app)
      .patch(`/api/tournaments/${TOURNAMENT_ID}/transfer`)
      .query({ token: 'view-tok-xxx' })
      .send({ email: 'target@example.com' })

    expect(res.status).toBe(403)
  })

  it('non-owner logged-in user is rejected with 403', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(nonOwnerUser as any)

    const res = await supertest(app)
      .patch(`/api/tournaments/${TOURNAMENT_ID}/transfer`)
      .set('Cookie', makeAuthCookie({
        userId: NON_OWNER_ID,
        email: nonOwnerUser.email,
        displayName: nonOwnerUser.displayName,
        isSystemAdmin: false,
      }))
      .send({ email: 'target@example.com' })

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/do not own/i)
  })

  it('tournament owner succeeds with 200', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(ownerUser as any)

    const res = await supertest(app)
      .patch(`/api/tournaments/${TOURNAMENT_ID}/transfer`)
      .set('Cookie', makeAuthCookie({
        userId: OWNER_ID,
        email: ownerUser.email,
        displayName: ownerUser.displayName,
        isSystemAdmin: false,
      }))
      .send({ email: 'target@example.com' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(vi.mocked(storage.transferTournamentOwnership)).toHaveBeenCalledWith(
      TOURNAMENT_ID,
      targetUser.id,
    )
  })

  it('master admin (system admin session) succeeds with 200', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(sysAdminUser as any)

    const res = await supertest(app)
      .patch(`/api/tournaments/${TOURNAMENT_ID}/transfer`)
      .set('Cookie', makeAuthCookie({
        userId: sysAdminUser.id,
        email: sysAdminUser.email,
        displayName: sysAdminUser.displayName,
        isSystemAdmin: true,
      }))
      .send({ email: 'target@example.com' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('unknown target email returns 404', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(ownerUser as any)
    vi.mocked(storage.getUserByEmail).mockResolvedValue(undefined)

    const res = await supertest(app)
      .patch(`/api/tournaments/${TOURNAMENT_ID}/transfer`)
      .set('Cookie', makeAuthCookie({
        userId: OWNER_ID,
        email: ownerUser.email,
        displayName: ownerUser.displayName,
        isSystemAdmin: false,
      }))
      .send({ email: 'nobody@example.com' })

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/no user found/i)
  })

  it('blocked target user returns 400', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(ownerUser as any)
    vi.mocked(storage.getUserByEmail).mockResolvedValue({
      ...targetUser,
      isBlocked: true,
    } as any)

    const res = await supertest(app)
      .patch(`/api/tournaments/${TOURNAMENT_ID}/transfer`)
      .set('Cookie', makeAuthCookie({
        userId: OWNER_ID,
        email: ownerUser.email,
        displayName: ownerUser.displayName,
        isSystemAdmin: false,
      }))
      .send({ email: 'target@example.com' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/blocked/i)
  })
})
