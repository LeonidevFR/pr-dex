import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ArenaPanel from './ArenaPanel.vue'

const exemplaire = (key, species, shiny = false) => ({ key, species, shiny })

const monter = (props = {}) => mount(ArenaPanel, {
  props: {
    credits: 3,
    pokedollars: 250,
    challenges: [],
    engageable: [exemplaire('github:a', 6), exemplaire('github:b', 25)],
    myOpen: null,
    levelOf: (k) => (k === 'github:a' ? 4 : 1),
    formOfKey: () => ({ name: 'Normal', factor: 1 }),
    ...props,
  },
})

describe('ArenaPanel', () => {
  it('annonce les engagements restants et le portefeuille', () => {
    const w = monter()
    expect(w.text()).toContain('3')
    expect(w.text()).toContain('engagements')
    expect(w.text()).toContain('250')
    expect(w.text()).toContain('₽')
  })

  // Faire disparaître la liste donnait un écran qui semblait cassé alors qu'il appliquait une
  // règle : on la garde visible, désactivée, avec l'explication à côté.
  it('garde la liste visible mais inerte quand il ne reste aucun engagement', () => {
    const w = monter({ credits: 0 })
    expect(w.text()).toContain('un par jour ouvré')
    expect(w.findAll('.arena-pick')).toHaveLength(2)
    expect(w.find('.arena-pick').attributes('disabled')).toBeDefined()
  })

  it('propose d’engager chaque exemplaire disponible, avec son niveau', () => {
    const w = monter()
    const choix = w.findAll('.arena-pick')
    expect(choix).toHaveLength(2)
    expect(choix[0].text()).toContain('Dracaufeu')
    expect(choix[0].text()).toContain('niv. 4')
  })

  // Rien ne part tant qu'on n'a pas confirmé : le clic sur un Pokémon choisit, il n'engage pas.
  it('ne déclenche rien au simple choix d’un exemplaire', async () => {
    const w = monter()
    await w.findAll('.arena-pick')[0].trigger('click')
    expect(w.emitted('engage')).toBeUndefined()
  })

  // La barre d'action est collée au bas du panneau : posée à la suite d'une grille défilante,
  // elle sortait de l'écran juste après le clic qui l'avait fait apparaître.
  it('rappelle l’enjeu dans la barre d’action, sans quitter l’écran', async () => {
    const w = monter()
    await w.findAll('.arena-pick')[0].trigger('click')
    const barre = w.find('.arena-bar')
    expect(barre.exists()).toBe(true)
    expect(barre.text()).toContain('Dracaufeu')
    expect(barre.text()).toContain('S’il perd, il est détruit')
  })

  it('poste un défi avec l’exemplaire choisi', async () => {
    const w = monter()
    await w.findAll('.arena-pick')[0].trigger('click')
    await w.find('.btn-solid').trigger('click')
    expect(w.emitted('engage')[0]).toEqual(['github:a', false])
  })

  it('n’engage rien tant qu’aucun exemplaire n’est retenu', async () => {
    const w = monter({
      engageable: [exemplaire('github:a', 6), exemplaire('github:a2', 6)],
    })
    await w.find('.arena-pick').trigger('click')
    expect(w.find('.btn-solid').exists()).toBe(false)
  })

  it('affronte l’ordinateur avec le même exemplaire', async () => {
    const w = monter()
    await w.findAll('.arena-pick')[1].trigger('click')
    await w.findAll('.btn-ghost').find((b) => b.text().includes('ordinateur')).trigger('click')
    expect(w.emitted('engage')[0]).toEqual(['github:b', true])
  })

  // Les deux mises se révèlent en même temps : on choisit la sienne avant de savoir contre qui,
  // et jamais après avoir vu celle d'en face.
  it('n’affiche jamais la mise d’un défi ouvert', () => {
    const w = monter({ challenges: [{ id: 7, pseudo: 'bob', created_at: 'x' }] })
    expect(w.text()).toContain('bob')
    expect(w.text()).toContain('Pokémon caché')
  })

  it('refuse de relever tant qu’on n’a rien engagé', async () => {
    const w = monter({ challenges: [{ id: 7, pseudo: 'bob', created_at: 'x' }] })
    // Le bouton porte lui-même son état : muet, il se lisait comme cassé.
    expect(w.find('.evo-btn').attributes('disabled')).toBeDefined()
    expect(w.find('.evo-btn').text()).toBe('Choisis ta mise')
    expect(w.text()).toContain('le Pokémon que')
  })

  it('relève un défi une fois la mise choisie', async () => {
    const w = monter({ challenges: [{ id: 7, pseudo: 'bob', created_at: 'x' }] })
    await w.findAll('.arena-pick')[0].trigger('click')
    await w.find('.evo-btn').trigger('click')
    expect(w.emitted('accept')[0]).toEqual([7, 'github:a'])
  })

  // On ne peut pas se battre contre soi-même : son propre défi est rappelé à part, avec sa mise,
  // que l'on est seul à voir.
  it('sort son propre défi de la liste des défis relevables', () => {
    const w = monter({
      challenges: [{ id: 7, pseudo: 'moi', created_at: 'x' }],
      myOpen: { id: 7, challenger_key: 'github:a', species: 6 },
    })
    expect(w.findAll('.evo-btn')).toHaveLength(0)
    expect(w.text()).toContain('Dracaufeu est sur la table')
  })

  it('dit qu’un défi sans preneur finira contre l’ordinateur', () => {
    const w = monter()
    expect(w.text()).toContain('l’ordinateur le relèvera demain')
  })

  // Les règles doivent être lisibles sur place : personne n'ira les chercher ailleurs, et sans
  // elles « l'enjeu est le plus petit des deux engagements » ne veut rien dire pour quiconque
  // n'a pas conçu le mode.
  it('explique les règles à la demande, sans les imposer', async () => {
    const w = monter()
    expect(w.text()).not.toContain('comme au poker')
    await w.findAll('.btn-ghost').find((b) => b.text().includes('Comment ça marche')).trigger('click')
    expect(w.text()).toContain('comme au poker')
    expect(w.text()).toContain('une chance sur vingt')
  })

  // À cinquante exemplaires ouverts, une liste à plat devient illisible : une vignette par
  // espèce, portant le niveau du meilleur, et le choix de l'exemplaire au clic.
  it('n’affiche qu’une vignette par espèce, avec son meilleur niveau', () => {
    const w = monter({
      engageable: [
        exemplaire('github:a', 6), exemplaire('github:a2', 6), exemplaire('github:b', 25),
      ],
      levelOf: (k) => (k === 'github:a2' ? 7 : 1),
    })
    const choix = w.findAll('.arena-pick')
    expect(choix).toHaveLength(2)
    expect(choix[0].text()).toContain('niv. 7')
    expect(choix[0].text()).toContain('×2')
  })

  it('demande lequel engager quand l’espèce a plusieurs exemplaires', async () => {
    const w = monter({
      engageable: [exemplaire('github:a', 6), exemplaire('github:a2', 6)],
      levelOf: (k) => (k === 'github:a2' ? 7 : 1),
    })
    await w.find('.arena-pick').trigger('click')
    expect(w.text()).toContain('Lequel de tes')
    expect(w.findAll('.picker-row')).toHaveLength(2)
    // Du plus aguerri au plus frais : c'est l'ordre dans lequel on décide.
    expect(w.findAll('.picker-row')[0].text()).toContain('niv. 7')
  })

  // Un seul exemplaire, un seul geste possible : autant l'épargner au joueur.
  it('choisit directement quand l’espèce n’a qu’un exemplaire', async () => {
    const w = monter({ engageable: [exemplaire('github:b', 25)] })
    await w.find('.arena-pick').trigger('click')
    expect(w.findAll('.picker-row')).toHaveLength(0)
    await w.find('.btn-solid').trigger('click')
    expect(w.emitted('engage')[0]).toEqual(['github:b', false])
  })

  it('bloque les boutons pendant un appel en cours', async () => {
    const w = monter({ busy: true })
    await w.findAll('.arena-pick')[0].trigger('click')
    expect(w.find('.btn-solid').attributes('disabled')).toBeDefined()
  })
})

/**
 * La forme du jour entre dans le calcul de puissance au même titre que le niveau. L'afficher
 * est la seule façon d'engager en connaissance de cause : sans elle, on envoie son champion un
 * jour où il est épuisé et l'on perd sans jamais savoir pourquoi.
 */
describe('forme du jour', () => {
  const enForme = { name: 'En pleine forme', factor: 1.10 }
  const epuise = { name: 'Épuisé', factor: 0.90 }

  it('annonce la forme de l’exemplaire retenu dans la barre d’action', async () => {
    const w = monter({ formOfKey: () => enForme })
    await w.findAll('.arena-pick')[0].trigger('click')
    expect(w.find('.arena-bar').text().toLowerCase()).toContain('en pleine forme')
  })

  it('distingue visuellement une forme au-dessus et en dessous de la normale', async () => {
    const bon = monter({ formOfKey: () => enForme })
    await bon.findAll('.arena-pick')[0].trigger('click')
    expect(bon.find('.arena-bar .form-up').exists()).toBe(true)

    const mauvais = monter({ formOfKey: () => epuise })
    await mauvais.findAll('.arena-pick')[0].trigger('click')
    expect(mauvais.find('.arena-bar .form-down').exists()).toBe(true)
  })

  it('la donne aussi pour chaque exemplaire au moment de choisir', async () => {
    const w = monter({
      engageable: [exemplaire('github:a', 6), exemplaire('github:a2', 6)],
      formOfKey: (k) => (k === 'github:a' ? epuise : enForme),
    })
    await w.find('.arena-pick').trigger('click')
    const lignes = w.findAll('.picker-row')
    expect(lignes.map((l) => l.text())).toEqual(
      expect.arrayContaining([expect.stringContaining('Épuisé'), expect.stringContaining('En pleine forme')]),
    )
  })
})

// Venir depuis la fiche, c'est arriver avec un Pokémon déjà en tête : l'obliger à le retrouver
// dans la grille qu'il vient de quitter serait absurde.
describe('arrivée depuis la fiche d’une espèce', () => {
  it('retient d’emblée le Pokémon présélectionné', () => {
    const w = monter({ preselect: 'github:b' })
    expect(w.find('.arena-bar').exists()).toBe(true)
    expect(w.find('.arena-bar').text()).toContain('Pikachu')
  })

  it('laisse alors toutes les options ouvertes', () => {
    const w = monter({
      preselect: 'github:b',
      challenges: [{ id: 7, pseudo: 'bob', created_at: 'x' }],
    })
    expect(w.find('.btn-solid').text()).toContain('Poster un défi')
    expect(w.findAll('.btn-ghost').some((b) => b.text().includes('ordinateur'))).toBe(true)
    expect(w.find('.evo-btn').attributes('disabled')).toBeUndefined()
  })
})

/**
 * Le classement est du prestige, pas de la matière : les points repartent à zéro chaque saison,
 * et c'est le badge qui reste. D'où deux sources distinctes — le classement en cours vient des
 * points, les badges des podiums consignés, qu'aucun recalcul ne pourrait retrouver.
 */
describe('saison', () => {
  const classement = [
    { user_id: 'u-bob', pseudo: 'bob', points: 275, rank: 1 },
    { user_id: 'u-moi', pseudo: 'moi', points: 120, rank: 2 },
  ]
  const closes = [
    { season: '2026-S3', first_id: 'u-ada', second_id: 'u-moi', third_id: 'u-bob' },
    { season: '2026-S2', first_id: 'u-bob', second_id: 'u-ada', third_id: 'u-zoe' },
  ]

  const enSaison = async (props = {}) => {
    const w = monter({ season: '2026-S4', userId: 'u-moi', ...props })
    await w.findAll('.filter-chip').find((b) => b.text() === 'Saison').trigger('click')
    return w
  }

  it('classe les joueurs et se repère soi-même', async () => {
    const w = await enSaison({ leaderboard: classement })
    expect(w.text()).toContain('saison 2026-S4')
    expect(w.text()).toContain('bob')
    expect(w.text()).toContain('275 pts')
    expect(w.find('.mult').text()).toBe('toi')
  })

  // L'ordinateur ne donne jamais de point : une saison ne se gagne pas en solo, et il faut le
  // dire là où le classement est vide, sinon l'écran laisse croire à une panne.
  it('explique un classement vide', async () => {
    const w = await enSaison({ leaderboard: [] })
    expect(w.text()).toContain('l’ordinateur n’en donne jamais')
  })

  it('n’affiche que les podiums où l’on est monté', async () => {
    const w = await enSaison({ leaderboard: classement, seasons: closes })
    const badges = w.findAll('.arena-badge')
    expect(badges).toHaveLength(1)
    expect(badges[0].text()).toContain('2026-S3')
  })

  it('donne au badge le rang réellement obtenu', async () => {
    const w = await enSaison({ seasons: closes })
    expect(w.find('.arena-badge .sbadge').attributes('aria-label')).toContain('rang 2')
  })

  it('ne montre aucune section de badges à qui n’en a pas', async () => {
    const w = await enSaison({ seasons: [{ season: '2026-S2', first_id: 'u-x', second_id: null, third_id: null }] })
    expect(w.findAll('.arena-badge')).toHaveLength(0)
  })

  it('rappelle que seuls les badges survivent à la saison', async () => {
    const w = await enSaison({ leaderboard: classement })
    expect(w.text()).toContain('c’est le badge qui reste')
  })
})
