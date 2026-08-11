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
 * Deux onglets : le panneau porte déjà beaucoup, et acheter n'est pas se battre. Un pli acheté
 * s'ouvre comme les autres, aux mêmes cotes — seul l'ensemble dans lequel il pioche est décidé
 * d'avance, et c'est ce que l'écran doit dire pour que personne ne croie à un avantage payant.
 */
describe('boutique', () => {
  const catalogue = [
    { slug: 'gen1-c', gen: 1, tier: 'c', fresh: false, price: 250 },
    { slug: 'gen2-r-inedit', gen: 2, tier: 'r', fresh: true, price: 6000 },
  ]

  const enBoutique = async (props = {}) => {
    const w = monter({ shop: catalogue, ...props })
    await w.findAll('.filter-chip').find((b) => b.text() === 'Boutique').trigger('click')
    return w
  }

  it('reste sur les duels par défaut', () => {
    const w = monter({ shop: catalogue })
    expect(w.text()).not.toContain('Ce que les pokédollars achètent')
  })

  it('nomme chaque article par ce qu’il donne', async () => {
    const w = await enBoutique()
    expect(w.text()).toContain('Pli commun')
    expect(w.text()).toContain('Pli rare · Gen 2 · inédit garanti')
  })

  it('achète l’article demandé', async () => {
    const w = await enBoutique({ pokedollars: 10000 })
    await w.findAll('.evo-btn')[0].trigger('click')
    expect(w.emitted('buy')[0]).toEqual(['gen1-c'])
  })

  // Dire combien il manque plutôt que griser sans raison : un bouton muet se lit comme cassé.
  it('dit ce qui manque quand le solde ne suffit pas', async () => {
    const w = await enBoutique({ pokedollars: 300 })
    const boutons = w.findAll('.evo-btn')
    expect(boutons[0].attributes('disabled')).toBeUndefined()
    expect(boutons[1].text()).toBe('il manque 5700 ₽')
    expect(boutons[1].attributes('disabled')).toBeDefined()
  })

  it('prévient que le pli n’arrive pas à la seconde', async () => {
    const w = await enBoutique()
    expect(w.text()).toContain('au prochain passage de la collecte')
  })

  it('rappelle que les cotes ne changent pas', async () => {
    const w = await enBoutique()
    expect(w.text()).toContain('aux mêmes cotes')
  })
})
