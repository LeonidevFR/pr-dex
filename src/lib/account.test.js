import { describe, it, expect } from 'vitest'
import { accountName, providersOf, identitiesOf, shouldInviteSlack, readAuthError, withoutAuthError } from './account.js'

describe('accountName', () => {
  it('préfère le login GitHub', () => {
    expect(accountName({ user_metadata: { user_name: 'leo', name: 'Léonard' } })).toBe('leo')
  })
  it('prend le nom Slack à défaut', () => {
    expect(accountName({ user_metadata: { name: 'Alice Martin' } })).toBe('Alice Martin')
    expect(accountName({ user_metadata: { full_name: 'Bob' } })).toBe('Bob')
  })
  it('rend une chaîne vide sans métadonnées', () => {
    expect(accountName({})).toBe('')
    expect(accountName(null)).toBe('')
  })
})

describe('providersOf', () => {
  it('liste les fournisseurs liés au compte, sans doublon', () => {
    const user = { identities: [{ provider: 'github' }, { provider: 'slack_oidc' }, { provider: 'github' }] }
    expect(providersOf(user)).toEqual(['github', 'slack_oidc'])
  })
  it('rend une liste vide sans identités', () => {
    expect(providersOf({})).toEqual([])
  })
})

describe('readAuthError', () => {
  it('lit une erreur renvoyée dans la query', () => {
    const href = 'https://x.io/pr-dex/?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked'
    expect(readAuthError(href)).toEqual({ code: 'identity_already_exists', description: 'Identity is already linked' })
  })
  it('lit une erreur renvoyée dans le fragment', () => {
    const href = 'https://x.io/pr-dex/#error=access_denied&error_description=User+cancelled'
    expect(readAuthError(href)).toEqual({ code: 'access_denied', description: 'User cancelled' })
  })
  it('rend null sans erreur', () => {
    expect(readAuthError('https://x.io/pr-dex/?demo')).toBeNull()
  })
})

describe('withoutAuthError', () => {
  it('retire les paramètres d’erreur et garde le reste', () => {
    expect(withoutAuthError('https://x.io/pr-dex/?demo&error=e&error_code=c&error_description=d'))
      .toBe('https://x.io/pr-dex/?demo=')
    expect(withoutAuthError('https://x.io/pr-dex/#error=e&error_description=d')).toBe('https://x.io/pr-dex/')
  })
})

describe('identitiesOf', () => {
  it('liste les comptes liés avec leur nom, GitHub d’abord', () => {
    const user = { identities: [
      { provider: 'slack_oidc', identity_data: { name: 'Léonard Ploton' } },
      { provider: 'github', identity_data: { user_name: 'LeonidevFR', name: 'Léonard' } },
    ] }
    expect(identitiesOf(user)).toEqual([
      { provider: 'github', name: 'LeonidevFR' },
      { provider: 'slack_oidc', name: 'Léonard Ploton' },
    ])
  })
  it('rend une liste vide sans identités', () => {
    expect(identitiesOf(null)).toEqual([])
  })
})

describe('shouldInviteSlack', () => {
  const base = { demo: false, providers: ['github'], dismissed: false }
  it('invite un compte GitHub sans Slack', () => {
    expect(shouldInviteSlack(base)).toBe(true)
  })
  it.each([
    ['en démo', { demo: true }],
    ['une fois Slack lié', { providers: ['github', 'slack_oidc'] }],
    ['pour un compte arrivé par Slack', { providers: ['slack_oidc'] }],
    ['une fois le bandeau fermé', { dismissed: true }],
  ])('n’invite pas %s', (_, over) => {
    expect(shouldInviteSlack({ ...base, ...over })).toBe(false)
  })
})
