import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SeasonBoard from './SeasonBoard.vue'

const MOI = 'u-moi'
const CLASSEMENT = [
  { user_id: 'u-marion', slug: 'marion-g', login: 'marion-g', points: 310, rank: 1 },
  { user_id: 'u-thomas', slug: 'thomas-k', login: 'thomas-k', points: 185, rank: 2 },
  { user_id: 'u-sarah', slug: 'sarah-b', login: 'sarah-b', points: 120, rank: 3 },
  { user_id: MOI, slug: 'leonard', login: 'leonard', points: 95, rank: 4 },
]

const monter = (props = {}) => mount(SeasonBoard, {
  props: { leaderboard: CLASSEMENT, userId: MOI, ...props },
})

/**
 * Le classement de la saison, sorti de l'écran « Saison » pour tenir à côté de celui d'équipe :
 * ce sont les mêmes personnes, sur deux mesures.
 */
describe('SeasonBoard', () => {
  // Le nom affiché est le login GitHub ; l'avatar le suit, comme au classement d'équipe.
  it('situe le joueur dans le classement, sous son identité GitHub', () => {
    const w = monter()
    expect(w.find('tr.me .board-login').text()).toBe('leonard')
    expect(w.find('tr.me td.lead').text()).toBe('95')
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
  it('emmène à la fiche du joueur cliqué, adressée par son login', async () => {
    const w = monter()
    await w.findAll('.saison-voir')[0].trigger('click')
    expect(w.emitted('profile')[0]).toEqual(['marion-g'])
  })

  /**
   * Sa propre ligne menait à /profile/soi, qui est la vue d'un TIERS : en démonstration elle
   * annonçait « Personne ne joue sous ce nom » sur sa propre fiche, et en production elle
   * aurait montré ses chiffres amputés de ce qu'elle ne publie pas.
   */
  it('renvoie chez soi pour sa propre ligne, et non vers une fiche publique', async () => {
    const w = monter()
    await w.find('tr.me .saison-voir').trigger('click')
    expect(w.emitted('me')).toHaveLength(1)
    expect(w.emitted('profile')).toBeUndefined()
    expect(w.find('tr.me .saison-voir').attributes('title')).toBe('Voir ta fiche')
  })

  it('le dit quand personne n’a encore marqué', () => {
    const w = monter({ leaderboard: [] })
    expect(w.text()).toContain('Personne n’a encore marqué')
    expect(w.findAll('.board-table tbody tr')).toHaveLength(0)
  })
})
