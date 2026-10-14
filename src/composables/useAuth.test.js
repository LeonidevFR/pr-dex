import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOAuth: vi.fn(),
  linkIdentity: vi.fn(),
  getUserIdentities: vi.fn(),
  unlinkIdentity: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('../lib/supabaseClient.js', () => ({ supabase: { auth } }))

import { useAuth } from './useAuth.js'

beforeEach(() => {
  vi.clearAllMocks()
  auth.getSession.mockResolvedValue({ data: { session: null } })
  window.history.replaceState({}, '', '/')
})

describe('useAuth', () => {
  // La session gardée par supabase-js peut dater d'avant une liaison : seule une lecture
  // auprès de Supabase dit quels comptes sont réellement liés.
  it('relit le compte auprès de Supabase', async () => {
    const user = { id: 'u1', identities: [{ provider: 'github' }, { provider: 'slack_oidc' }] }
    auth.getUser.mockResolvedValue({ data: { user }, error: null })
    expect(await useAuth().freshUser()).toEqual(user)
  })

  it('rend null si Supabase ne peut pas relire le compte', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'x' } })
    expect(await useAuth().freshUser()).toBeNull()
  })

  // Supabase peut refuser la liaison avant toute redirection (« Manual linking » désactivé) :
  // sans ça, le bouton ne faisait rien, sans un mot.
  it('expose le refus immédiat d’une liaison', async () => {
    auth.linkIdentity.mockResolvedValue({ data: null, error: { code: 'manual_linking_disabled', message: 'Manual linking is disabled' } })
    const { authError, link } = useAuth()
    await link('slack_oidc')
    await flushPromises()
    expect(authError.value).toEqual({ code: 'manual_linking_disabled', description: 'Manual linking is disabled' })
  })

  it('lie le fournisseur demandé', async () => {
    auth.linkIdentity.mockResolvedValue({ data: {}, error: null })
    await useAuth().link('github')
    expect(auth.linkIdentity).toHaveBeenCalledWith(expect.objectContaining({ provider: 'github' }))
  })

  it('délie le compte demandé puis rafraîchit la session', async () => {
    const slack = { provider: 'slack_oidc', identity_id: 'i2' }
    auth.getUserIdentities.mockResolvedValue({ data: { identities: [{ provider: 'github', identity_id: 'i1' }, slack] }, error: null })
    auth.unlinkIdentity.mockResolvedValue({ data: {}, error: null })
    auth.refreshSession.mockResolvedValue({ data: {}, error: null })
    expect(await useAuth().unlink('slack_oidc')).toBe(true)
    expect(auth.unlinkIdentity).toHaveBeenCalledWith(slack)
    expect(auth.refreshSession).toHaveBeenCalled()
  })

  it('expose le refus d’une déliaison', async () => {
    auth.getUserIdentities.mockResolvedValue({ data: { identities: [{ provider: 'slack_oidc', identity_id: 'i2' }] }, error: null })
    auth.unlinkIdentity.mockResolvedValue({ data: null, error: { code: 'single_identity_not_deletable', message: 'User must have at least 1 identity after unlinking' } })
    const { authError, unlink } = useAuth()
    expect(await unlink('slack_oidc')).toBe(false)
    expect(authError.value.code).toBe('single_identity_not_deletable')
  })

  it('ne signale rien quand la liaison part vers Slack', async () => {
    auth.linkIdentity.mockResolvedValue({ data: { url: 'https://slack.com/x' }, error: null })
    const { authError, link } = useAuth()
    await link('slack_oidc')
    expect(authError.value).toBeNull()
  })
})
