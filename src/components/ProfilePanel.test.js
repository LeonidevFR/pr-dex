import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProfilePanel from './ProfilePanel.vue'

const DOSSIER = { user_id: 'u-moi', pseudo: 'moi', species: 87, wins: 18, losses: 7 }
const PRIVE = { copies: 243, pokedollars: 1250, credits: 3, destroyed: 4 }
const SAISONS = [
  { season: '2026-S3', first_id: 'u-lui', second_id: 'u-moi', third_id: null },
  { season: '2026-S2', first_id: 'u-moi', second_id: null, third_id: null },
]

const monter = (props = {}) => mount(ProfilePanel, {
  props: { dossier: DOSSIER, prive: PRIVE, seasons: SAISONS, points: 240, season: '2026-S4', ...props },
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
  it('montre tout de son propre dossier', () => {
    const w = monter()
    expect(valeurDe(w, 'Exemplaires').find('b').text()).toBe('243')
    expect(valeurDe(w, 'Pokédollars').find('b').text()).toBe('1250 ₽')
    expect(valeurDe(w, 'Crédits').find('b').text()).toBe('3')
    expect(valeurDe(w, 'Exemplaires perdus').find('b').text()).toBe('4')
  })

  // Le nombre d'exemplaires est un compteur brut de PR mergées : le publier dans une entreprise
  // reviendrait à afficher un classement de productivité.
  it('caviarde chez un collègue ce qui ne se publie pas', () => {
    const w = monter({ pseudo: 'marion', prive: null })
    for (const l of ['Exemplaires', 'Pokédollars', 'Crédits', 'Exemplaires perdus']) {
      expect(valeurDe(w, l).classes()).toContain('secret')
      expect(valeurDe(w, l).find('b').text()).toBe('—')
    }
  })

  it('publie en revanche les espèces et le palmarès de duels', () => {
    const w = monter({ pseudo: 'marion', prive: null })
    expect(valeurDe(w, 'Espèces').find('b').text()).toBe('087')
    expect(valeurDe(w, 'Duels gagnés').find('b').text()).toBe('18')
    expect(valeurDe(w, 'Perdus').find('b').text()).toBe('7')
  })

  // Les cases interdites restent en place, hachurées : une case absente laisserait croire
  // qu'il n'y avait rien à dire, une case barrée montre où passe la règle.
  it('garde les cases caviardées à l’écran plutôt que de les retirer', () => {
    const w = monter({ pseudo: 'marion', prive: null })
    expect(w.findAll('.prof-case')).toHaveLength(8)
    expect(w.findAll('.prof-case.secret')).toHaveLength(4)
  })

  /**
   * La question que tout le monde se pose une fois — qu'est-ce que les autres voient de moi ? —
   * mérite une réponse d'un clic plutôt qu'une note de bas de page.
   */
  it('permet de relire son propre dossier avec les yeux d’un collègue', async () => {
    const w = monter()
    expect(w.findAll('.prof-case.secret')).toHaveLength(0)
    await w.find('.prof-bascule .filter-chip').trigger('click')
    expect(w.findAll('.prof-case.secret')).toHaveLength(4)
    expect(valeurDe(w, 'Espèces').find('b').text()).toBe('087')
  })

  it('n’offre pas ce miroir chez quelqu’un d’autre, où il n’a aucun sens', () => {
    expect(monter({ pseudo: 'marion' }).find('.prof-bascule').exists()).toBe(false)
  })

  it('dresse l’étagère des podiums, et d’eux seuls', () => {
    const badges = monter().findAll('.prof-badge')
    expect(badges).toHaveLength(2)
    expect(badges[0].text()).toContain('2026-S3')
  })

  it('le dit quand il n’y a pas encore de podium', () => {
    expect(monter({ seasons: [] }).text()).toContain('Aucune saison sur le podium')
  })

  // Un pseudonyme se change : un lien partagé peut désigner quelqu'un qui s'est renommé.
  it('explique un profil introuvable au lieu d’afficher un dossier vide', () => {
    const w = monter({ pseudo: 'fantome', dossier: null, introuvable: true })
    expect(w.text()).toContain('Personne ne joue sous ce nom')
    expect(w.findAll('.prof-case')).toHaveLength(0)
  })
})
