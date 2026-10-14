import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProfilePanel from './ProfilePanel.vue'

const FICHE = { user_id: 'u-moi', slug: 'leo-dev', login: 'leo-dev', species: 87, wins: 18, losses: 7 }
const PRIVE = { copies: 243, pokedollars: 1250, credits: 3, destroyed: 4 }
const SAISONS = [
  { season: '2026-S3', first_id: 'u-lui', second_id: 'u-moi', third_id: null },
  { season: '2026-S2', first_id: 'u-moi', second_id: null, third_id: null },
]

const monter = (props = {}) => mount(ProfilePanel, {
  props: { fiche: FICHE, prive: PRIVE, seasons: SAISONS, points: 240, season: '2026-S4', ...props },
})

const valeurDe = (w, label) => w.findAll('.prof-case')
  .find((c) => c.find('span').text() === label)

/**
 * Le profil applique la règle de visibilité de la spec § 5, mais ne la porte pas : c'est la
 * vue SQL qui la garantit, en n'ayant tout simplement pas les colonnes interdites. Ce qui se
 * teste ici est que l'écran ne trahisse pas cette règle en sens inverse — en montrant à un
 * visiteur ce que seul le propriétaire fournit.
 */
describe('ProfilePanel', () => {
  it('montre tout de sa propre fiche', () => {
    const w = monter()
    expect(valeurDe(w, 'Exemplaires').find('b').text()).toBe('243')
    expect(valeurDe(w, 'Pokédollars').find('b').text()).toBe('1250 ₽')
    expect(valeurDe(w, 'Crédits d’arène').find('b').text()).toBe('3')
    expect(valeurDe(w, 'Exemplaires perdus').find('b').text()).toBe('4')
  })

  // Le nombre d'exemplaires est un compteur brut de PR mergées : le publier dans une entreprise
  // reviendrait à afficher un classement de productivité.
  it('caviarde chez un collègue ce qui ne se publie pas', () => {
    const w = monter({ cherche: 'marion', prive: null })
    for (const l of ['Exemplaires', 'Pokédollars', 'Crédits d’arène', 'Exemplaires perdus']) {
      expect(valeurDe(w, l).classes()).toContain('secret')
      expect(valeurDe(w, l).find('b').text()).toBe('—')
    }
  })

  it('publie en revanche les espèces et le palmarès de duels', () => {
    const w = monter({ cherche: 'marion', prive: null })
    expect(valeurDe(w, 'Espèces').find('b').text()).toBe('087')
    expect(valeurDe(w, 'Duels gagnés').find('b').text()).toBe('18')
    expect(valeurDe(w, 'Perdus').find('b').text()).toBe('7')
  })

  // Les cases interdites restent en place, hachurées : une case absente laisserait croire
  // qu'il n'y avait rien à dire, une case barrée montre où passe la règle.
  it('garde les cases caviardées à l’écran plutôt que de les retirer', () => {
    const w = monter({ cherche: 'marion', prive: null })
    expect(w.findAll('.prof-case')).toHaveLength(9)
    expect(w.findAll('.prof-case.secret')).toHaveLength(5)
  })

  // Vendre n'est pas perdre : deux compteurs, et celui de la revente porte ce qu'elle a rapporté.
  it('sépare les exemplaires perdus des exemplaires revendus', () => {
    const w = monter({ prive: { ...PRIVE, destroyed: 4, sold: 12, soldTotal: 140 } })
    expect(valeurDe(w, 'Exemplaires perdus').find('b').text()).toBe('4')
    expect(valeurDe(w, 'Revendus · 140 ₽').find('b').text()).toBe('12')
  })

  /**
   * Chez soi, on veut voir ses affaires — pas les trous qu'un tiers verrait à leur place. Aucun
   * caviardage, et aucun bouton pour en demander : la règle de visibilité se lit en une phrase
   * sous le tableau, elle n'a pas à abîmer l'écran de son propriétaire.
   */
  it('ne caviarde jamais sa propre fiche, et n’offre pas de le faire', () => {
    const w = monter()
    expect(w.findAll('.prof-case.secret')).toHaveLength(0)
    expect(w.text()).not.toContain('Caviarder')
  })

  // Le mot « crédits » seul se lisait comme des plis à ouvrir : ce sont des engagements d'arène.
  it('dit de quels crédits il s’agit', () => {
    expect(monter().text()).toContain('Crédits d’arène')
  })

  it('dresse l’étagère des podiums, et d’eux seuls', () => {
    const badges = monter().findAll('.prof-badge')
    expect(badges).toHaveLength(2)
    expect(badges[0].text()).toContain('2026-S3')
  })

  it('le dit quand il n’y a pas encore de podium', () => {
    expect(monter({ seasons: [] }).text()).toContain('Aucune saison sur le podium')
  })

  // Un login GitHub se change : un lien partagé peut désigner quelqu'un qui s'est renommé.
  it('explique une fiche introuvable au lieu d’en afficher une vide', () => {
    const w = monter({ cherche: 'fantome', fiche: null, introuvable: true })
    expect(w.text()).toContain('Personne ne joue sous ce nom')
    expect(w.findAll('.prof-case')).toHaveLength(0)
  })
})

/**
 * La fiche porte le nom du compte : celui que les deux classements affichent et sous lequel
 * l'équipe se connaît. Il n'y a plus de nom à choisir, donc plus d'état « sans nom » à gérer —
 * c'est tout l'intérêt d'avoir retiré le pseudonyme.
 */
describe('le titre de la fiche', () => {
  it('porte le nom rendu par la base', () => {
    expect(monter().find('.view-title i').text()).toBe('leo-dev')
  })

  // La base fait foi, y compris chez soi : c'est le nom que les autres lisent.
  it('préfère le nom de la base au nom du compte en session', () => {
    expect(monter({ moi: 'autre-chose' }).find('.view-title i').text()).toBe('leo-dev')
  })

  // Le temps du chargement, la fiche n'est pas encore là : le titre tient quand même, avec ce
  // qu'on sait — le login de l'URL chez un collègue, son propre nom de compte chez soi.
  it('tient pendant le chargement, sans fiche', () => {
    expect(monter({ fiche: null, cherche: 'marion', loading: true }).find('.view-title i').text()).toBe('marion')
    expect(monter({ fiche: null, moi: 'leo-dev', loading: true }).find('.view-title i').text()).toBe('leo-dev')
  })
})
