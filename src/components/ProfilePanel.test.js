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
 * même case montrait un chiffre chez soi et une barre chez l'autre. « Ma fiche » a repris le cas
 * du propriétaire, qui n'a aucune raison de voir ses propres affaires hachurées.
 *
 * L'écran applique la règle de visibilité de la spec § 5 sans la porter : c'est la vue SQL qui
 * la garantit, en n'ayant tout simplement pas les colonnes interdites. Ce qui se teste ici est
 * qu'il ne la trahisse pas en sens inverse.
 */
describe('ProfilePanel', () => {
  /**
   * Cinq cases hachurées annonçaient chez un collègue ce qu'on ne verrait pas de lui, et un
   * paragraphe expliquait pourquoi. Deux défauts : on ne vient pas sur la fiche de quelqu'un
   * pour apprendre ce qui n'y est pas, et « Exemplaires » barré mentait — le classement d'équipe
   * publie la colonne « Cartes », qui est ce nombre-là.
   *
   * Ce qu'on garde chez soi se lit maintenant chez soi, dans « Ma fiche », à côté des chiffres
   * concernés.
   */
  it('ne montre que ce que la vue publique contient', () => {
    const w = monter()
    expect(w.findAll('.prof-case').map((c) => c.find('span').text()))
      .toEqual(['Espèces', 'Duels gagnés', 'Perdus', 'Points · 2026-S4'])
    expect(w.text()).not.toContain('Les cases barrées')
    expect(w.text()).not.toContain('—')
  })

  it('publie en revanche les espèces et le palmarès de duels', () => {
    const w = monter({ cherche: 'marion', prive: null })
    expect(valeurDe(w, 'Espèces').find('b').text()).toBe('087')
    expect(valeurDe(w, 'Duels gagnés').find('b').text()).toBe('18')
    expect(valeurDe(w, 'Perdus').find('b').text()).toBe('7')
  })

  // Les points de la saison en cours sont publics — ils sont au classement, sous ce nom.
  it('porte les points de la saison, datés de la saison', () => {
    expect(valeurDe(monter(), 'Points · 2026-S4').find('b').text()).toBe('240')
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
