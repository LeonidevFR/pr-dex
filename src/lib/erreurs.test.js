import { describe, it, expect } from 'vitest'
import { messageDErreur } from './erreurs.js'
import { SupabaseDataError } from './supabaseData.js'

/**
 * Un refus vient d'une règle du jeu et le serveur l'écrit en français : ce message-là dit quoi
 * faire, et c'est lui qu'il faut montrer. Une panne porte un message technique qui n'apprend
 * rien. Confondre les deux donne soit un jargon incompréhensible, soit un « une erreur est
 * survenue » qui laisse le joueur sans recours.
 */
describe('messageDErreur', () => {
  it('cite le refus du serveur, sans son préfixe technique', () => {
    expect(messageDErreur(new Error('arene : aucun crédit d’engagement disponible cette semaine')))
      .toBe('Aucun crédit d’engagement disponible cette semaine')
  })

  it('cite de même les refus du dex et de la boutique', () => {
    expect(messageDErreur(new Error('dex : bonbons insuffisants (8 requis)')))
      .toBe('Bonbons insuffisants (8 requis)')
    expect(messageDErreur(new Error('boutique : il manque 250 pokédollars')))
      .toBe('Il manque 250 pokédollars')
  })

  // Le message d'une panne n'apprendrait rien : on dit ce qu'il y a à faire, réessayer.
  it('traduit une panne réseau plutôt que de la citer', () => {
    expect(messageDErreur(new SupabaseDataError('offline', 'Pas de connexion réseau.')))
      .toMatch(/Pas de connexion/)
    expect(messageDErreur(new SupabaseDataError('server', 'PGRST301 JWT expired')))
      .toMatch(/n’a pas répondu/)
  })

  it('ne laisse jamais un écran muet, même sans erreur exploitable', () => {
    expect(messageDErreur(undefined)).toBeTruthy()
    expect(messageDErreur({})).toBeTruthy()
    expect(messageDErreur(new Error(''))).toBeTruthy()
  })

  // Un message technique qui ressemblerait à un refus ne doit pas passer pour tel : seuls les
  // trois préfixes que nos fonctions SQL posent sont reconnus.
  it('ne prend pas n’importe quel message pour un refus', () => {
    expect(messageDErreur(new Error('TypeError : undefined is not a function')))
      .toMatch(/n’a pas répondu/)
  })
})
