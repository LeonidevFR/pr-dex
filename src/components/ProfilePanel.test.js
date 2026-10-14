import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProfilePanel from './ProfilePanel.vue'

const FICHE = { user_id: 'u-lui', slug: 'leo-dev', login: 'leo-dev', species: 87, wins: 18, losses: 7 }
const SAISONS = [
  { season: '2026-S3', first_id: 'u-autre', second_id: 'u-lui', third_id: null },
  { season: '2026-S2', first_id: 'u-lui', second_id: null, third_id: null },
]

const monter = (props = {}) => mount(ProfilePanel, {
  props: { fiche: FICHE, cherche: 'leo-dev', seasons: SAISONS, points: 240, season: '2026-S4', ...props },
})

const valeurDe = (w, label) => w.findAll('.prof-case')
  .find((c) => c.find('span').text() === label)

/**
 * La fiche publique d'un collègue, et rien d'autre.
 *
 * Elle servait aussi à sa propre fiche, avec un caviardage conditionnel sur chaque case : la
 * même case montrait un chiffre chez soi et une barre chez l'autre. « Moi » a repris le cas du
 * propriétaire, qui n'a aucune raison de voir ses propres affaires hachurées.
 *
 * L'écran applique la règle de visibilité de la spec § 5 sans la porter : c'est la vue SQL qui
 * la garantit, en n'ayant tout simplement pas les colonnes interdites. Ce qui se teste ici est
 * qu'il ne la trahisse pas en sens inverse.
 */
describe('ProfilePanel', () => {
  // L'économie d'arène et le stock ne figurent dans aucune vue publique : la case reste en
  // place, barrée, pour montrer où passe la règle plutôt que de raccourcir la page en silence.
  it('caviarde ce qui ne se publie pas', () => {
    const w = monter()
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

  // Vendre n'est pas perdre : deux compteurs distincts, barrés tous les deux chez un collègue.
  it('sépare les exemplaires perdus des exemplaires revendus', () => {
    const w = monter()
    expect(valeurDe(w, 'Exemplaires perdus').find('b').text()).toBe('—')
    expect(valeurDe(w, 'Revendus').find('b').text()).toBe('—')
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

  // La base fait foi : le login de l'URL ne sert qu'avant qu'elle ait répondu.
  it('préfère le nom de la base à celui de l’URL', () => {
    expect(monter({ cherche: 'ancien-login' }).find('.view-title i').text()).toBe('leo-dev')
  })

  // Le temps du chargement, la fiche n'est pas encore là : le titre tient quand même, avec ce
  // qu'on sait — le login de l'URL chez un collègue, son propre nom de compte chez soi.
  it('tient pendant le chargement, sans fiche', () => {
    expect(monter({ fiche: null, cherche: 'marion', loading: true }).find('.view-title i').text()).toBe('marion')
  })
})
