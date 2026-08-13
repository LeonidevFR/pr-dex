import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SeasonPanel from './SeasonPanel.vue'

const MOI = 'u-moi'
const CLASSEMENT = [
  { user_id: 'u-marion', pseudo: 'marion', points: 310, rank: 1 },
  { user_id: 'u-thomas', pseudo: 'thomas', points: 185, rank: 2 },
  { user_id: 'u-sarah', pseudo: 'sarah', points: 120, rank: 3 },
  { user_id: MOI, pseudo: 'toi', points: 95, rank: 4 },
]
const SAISONS = [
  { season: '2026-S3', first_id: 'u-marion', second_id: MOI, third_id: null },
  { season: '2026-S2', first_id: 'u-thomas', second_id: null, third_id: null },
]

const monter = (props = {}) => mount(SeasonPanel, {
  props: { season: '2026-S4', leaderboard: CLASSEMENT, seasons: SAISONS, userId: MOI, ...props },
})

beforeEach(() => {
  // Mi-saison : le sablier et les jours restants ne doivent pas dépendre du jour où l'on teste.
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 6, 16, 12))
})
afterEach(() => vi.useRealTimers())

describe('SeasonPanel', () => {
  // Le nom de code ne dit rien à personne : ce sont les mois qu'on retient.
  it('nomme la saison par ses mois, pas par son code', () => {
    expect(monter().find('.panel-name').text()).toBe('juillet et août 2026')
  })

  it('compte les jours qui restent à jouer', () => {
    // Du 16 juillet au 31 août inclus.
    expect(monter().text()).toContain('47')
  })

  it('situe le joueur dans le classement', () => {
    const w = monter()
    expect(w.find('.saison-rang.moi .nom').text()).toBe('toi')
    expect(w.find('.saison-rang.moi .pts').text()).toBe('95')
  })

  /**
   * Un classement dit où l'on est ; il ne dit pas ce qu'il reste à faire, et c'est pourtant la
   * seule question qu'on se pose en le regardant.
   */
  it('dit ce qui manque pour la troisième marche', () => {
    expect(monter().text()).toContain('25 points')
  })

  it('ne réclame rien à qui est déjà sur le podium', () => {
    const w = monter({ userId: 'u-marion' })
    expect(w.text()).not.toContain('Il te manque')
    expect(w.text()).toContain('Tu es sur le podium')
  })

  // Un nom qu'on regarde depuis des semaines mérite de mener quelque part.
  it('emmène au profil du joueur cliqué', async () => {
    const w = monter()
    await w.findAll('.saison-rang')[0].trigger('click')
    expect(w.emitted('profile')[0]).toEqual(['marion'])
  })

  it('publie le barème depuis le moteur, pas une liste recopiée', () => {
    const lignes = monter().findAll('.saison-ligne')
    expect(lignes).toHaveLength(4)
    expect(lignes[3].text()).toContain('60 pts')
    expect(lignes[3].text()).toContain('600 ₽')
  })

  // Une étagère à trous raconte une histoire qu'une liste de badges gagnés ne raconte pas.
  it('dresse l’étagère en gardant les socles des saisons manquées', () => {
    const socles = monter().findAll('.saison-socle')
    expect(socles).toHaveLength(2)
    expect(socles[0].text()).toContain('2e')
    expect(socles[1].classes()).toContain('vide')
    expect(socles[1].text()).toContain('hors podium')
  })

  it('le dit quand la saison est la première', () => {
    expect(monter({ seasons: [] }).text()).toContain('C’est la première saison')
  })

  it('le dit quand personne n’a encore marqué', () => {
    const w = monter({ leaderboard: [] })
    expect(w.text()).toContain('Personne n’a encore marqué')
    expect(w.findAll('.saison-rang')).toHaveLength(0)
  })
})
