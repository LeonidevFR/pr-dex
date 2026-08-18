import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SpeciesSheet from './SpeciesSheet.vue'
import { DEX, hasEvoInFamily } from '../../shared/species.js'

const capture = (id, species, extra = {}) => ({
  source: 'github', external_id: id, key: `github:${id}`, species, shiny: false, via: 'catch',
  label: 'fix: race condition', ref: 'moi/atlas#142 · a3f8c21',
  url: 'https://github.com/moi/atlas/pull/142', date: '2026-02-03', ...extra,
})
const evo = (species, from, extra = {}) => ({
  species, from, fromSha: 'abc', via: 'evo', date: '2026-07-14', shiny: false, ...extra,
})

const mountSheet = (props) =>
  mount(SpeciesSheet, {
    props: {
      id: 1, entries: null, available: [], candies: 0, canEvolve: false, isDeadEnd: false,
      caughtIds: new Set(), ...props,
    },
  })

describe('espèce non capturée', () => {
  it('masque le nom et montre la planche vide', () => {
    const w = mountSheet({ id: 4 })
    expect(w.find('.panel-name').text()).toBe('—————')
    expect(w.find('.panel-art').classes()).toContain('ghost')
  })

  it('indique de quelle évolution elle peut sortir', () => {
    expect(mountSheet({ id: 2 }).text()).toContain('Bulbizarre')
  })

  it('n’affiche pas de journal', () => {
    expect(mountSheet({ id: 4 }).find('.log').exists()).toBe(false)
  })
})

describe('la carte de la fiche', () => {
  // La carte gagnée au tirage est celle qu'on retrouve ici : même composant, même matière.
  // Seule la scène change — le tiroir est en lumière du jour, pas sous les projecteurs.
  it('montre la même carte que le rituel, en lumière du jour', () => {
    const w = mountSheet({ id: 6, entries: [capture('a', 6)] })
    const carte = w.findComponent({ name: 'PokeCard' })
    expect(carte.props('scene')).toBe('day')
    expect(carte.props('tier')).toBe(DEX[6].tier)
    // On consulte une espèce, pas un exemplaire daté : pas de dos, donc pas de provenance.
    expect(carte.props('provenance')).toBeNull()
  })

  it('porte le chromatique sur la carte', () => {
    const w = mountSheet({ id: 25, entries: [capture('a', 25, { shiny: true })] })
    expect(w.findComponent({ name: 'PokeCard' }).props('shiny')).toBe(true)
  })
})

describe('la carte en grand', () => {
  it('n’a rien à agrandir sur une silhouette non capturée', () => {
    const w = mountSheet({ id: 4 })
    expect(w.findComponent({ name: 'PokeCard' }).exists()).toBe(false)
    expect(w.find('.panel-art').classes()).toContain('ghost')
  })

  it('ouvre la carte en grand quand on active celle de la fiche', async () => {
    const w = mountSheet({ id: 25, entries: [capture('a', 25)] })
    expect(w.find('.zoom-scrim').exists()).toBe(false)
    await w.findComponent({ name: 'PokeCard' }).vm.$emit('activate')
    expect(w.find('.zoom-card').exists()).toBe(true)
  })

  // C'est bien la carte qu'on agrandit, dos compris — pas le sprite dans un cadre.
  it('donne un dos à la carte agrandie, avec la provenance de la dernière capture', async () => {
    const w = mountSheet({
      id: 25,
      entries: [capture('a', 25), capture('b', 25, { label: 'feat: dernière', date: '2026-03-09' })],
    })
    await w.findComponent({ name: 'PokeCard' }).vm.$emit('activate')
    const grande = w.findAll('.zoom-card')[0].findComponent({ name: 'PokeCard' })
    expect(grande.props('provenance')).toMatchObject({ label: 'feat: dernière', date: '2026-03-09' })
  })

  // Une espèce obtenue par évolution n'a pas de PR d'origine, mais elle a une origine :
  // sans dos, la carte se retournait sur une face vide alors que l'écran promettait un dos.
  it('donne un dos à la carte d’un exemplaire évolué', async () => {
    const w = mountSheet({ id: 130, entries: [evo(130, 129)] })
    await w.findComponent({ name: 'PokeCard' }).vm.$emit('activate')
    const grande = w.findAll('.zoom-card')[0].findComponent({ name: 'PokeCard' })
    expect(grande.props('provenance')).toMatchObject({
      ref: null, label: 'Évolué depuis Magicarpe', date: '2026-07-14',
    })
    expect(grande.find('.pkc-back').exists()).toBe(true)
  })

  it('se retourne au clic, et revient', async () => {
    const w = mountSheet({ id: 25, entries: [capture('a', 25)] })
    await w.findComponent({ name: 'PokeCard' }).vm.$emit('activate')
    const grande = () => w.findAll('.zoom-card')[0].findComponent({ name: 'PokeCard' })
    expect(grande().props('flipped')).toBe(false)

    await grande().vm.$emit('activate')
    expect(grande().props('flipped')).toBe(true)

    await grande().vm.$emit('activate')
    expect(grande().props('flipped')).toBe(false)
  })

  it('se referme au clic sur le fond', async () => {
    const w = mountSheet({ id: 25, entries: [capture('a', 25)] })
    await w.findComponent({ name: 'PokeCard' }).vm.$emit('activate')
    await w.find('.zoom-scrim').trigger('click')
    expect(w.find('.zoom-scrim').exists()).toBe(false)
  })

  // La carte porte déjà `tabindex` et Entrée : le clavier passe par le même chemin que le clic.
  it('respecte le clavier autant que le clic', async () => {
    const w = mountSheet({ id: 25, entries: [capture('a', 25)] })
    await w.find('.pkc').trigger('keyup.enter')
    expect(w.find('.zoom-scrim').exists()).toBe(true)
  })
})

describe('journal des captures', () => {
  it('lie chaque capture à l’URL que sa source a fournie', () => {
    const w = mountSheet({ id: 25, entries: [capture('a3f8c21e9b', 25)] })
    const row = w.find('a.log-row')
    expect(row.attributes('href')).toBe('https://github.com/moi/atlas/pull/142')
    expect(row.attributes('target')).toBe('_blank')
    expect(row.attributes('rel')).toContain('noopener')
  })

  it('affiche libellé, référence, source et date', () => {
    const w = mountSheet({ id: 25, entries: [capture('a3f8c21e9b', 25)] })
    expect(w.text()).toContain('fix: race condition')
    expect(w.text()).toContain('moi/atlas#142 · a3f8c21')
    expect(w.text()).toContain('github')
    expect(w.text()).toContain('2026-02-03')
  })

  // Une source qui n'expose pas de page par événement laisse `url` vide : la ligne doit
  // rester lisible, simplement pas cliquable.
  it('rend une capture sans URL en ligne non cliquable', () => {
    const w = mountSheet({ id: 25, entries: [capture('42', 25, { source: 'crm', url: null, ref: null })] })
    expect(w.find('a.log-row').exists()).toBe(false)
    expect(w.find('.log-row').text()).toContain('fix: race condition')
    expect(w.text()).toContain('crm')
  })

  it('rend une évolution sans lien', () => {
    const w = mountSheet({ id: 130, entries: [evo(130, 129)] })
    expect(w.find('a.log-row').exists()).toBe(false)
    expect(w.find('.log-evo').text()).toBe('↑ évo')
    expect(w.text()).toContain('Évolué depuis Magicarpe')
  })

  it('compte les exemplaires au pluriel', () => {
    const w = mountSheet({ id: 25, entries: [capture('a', 25), capture('b', 25)] })
    expect(w.text()).toContain('2 exemplaires')
  })

  it('compte un exemplaire au singulier', () => {
    expect(mountSheet({ id: 25, entries: [capture('a', 25)] }).text()).toContain('1 exemplaire')
  })
})

describe('bonbons et évolution', () => {
  it('affiche la jauge avec le coût de l’espèce', () => {
    const w = mountSheet({ id: 1, entries: [capture('a', 1)], candies: 3 })
    expect(w.find('.candy-nums').text()).toContain('3')
    expect(w.find('.candy-nums').text()).toContain('8')
  })

  it('désactive le bouton quand les bonbons manquent', () => {
    const w = mountSheet({ id: 1, entries: [capture('a', 1)], candies: 3, canEvolve: false })
    expect(w.find('.evo-btn:not(.arena-send)').attributes('disabled')).toBeDefined()
  })

  it('affiche le sélecteur d’exemplaire au clic sur le bouton d’évolution', async () => {
    const w = mountSheet({
      id: 1, entries: [capture('a', 1)], available: [capture('a', 1)], candies: 9, canEvolve: true,
    })
    await w.find('.evo-btn:not(.arena-send)').trigger('click')
    expect(w.find('.picker-row').exists()).toBe(true)
    expect(w.find('.evo-choices').exists()).toBe(false)
  })

  it('émet l’évolution avec l’exemplaire choisi après confirmation', async () => {
    const w = mountSheet({
      id: 1, entries: [capture('a', 1)], available: [capture('a', 1)], candies: 9, canEvolve: true,
    })
    await w.find('.evo-btn:not(.arena-send)').trigger('click')
    await w.find('.evo-btn:not(.arena-send)').trigger('click') // le même bouton sert de « Confirmer » à l'étape 2
    expect(w.emitted('evolve')[0]).toEqual([{ from: 1, to: 2, key: 'github:a' }])
  })

  it('propose les trois évolutions d’Évoli', () => {
    const w = mountSheet({ id: 133, entries: [capture('a', 133)], candies: 9, canEvolve: true })
    const choices = w.findAll('.evo-choice')
    expect(choices).toHaveLength(3)
    expect(w.text()).toContain('Aquali')
    expect(w.text()).toContain('Voltali')
    expect(w.text()).toContain('Pyroli')
  })

  it('émet le choix d’évolution d’Évoli après confirmation', async () => {
    const w = mountSheet({
      id: 133, entries: [capture('a', 133)], available: [capture('a', 133)], candies: 9, canEvolve: true,
    })
    await w.findAll('.evo-choice')[1].trigger('click')
    await w.find('.evo-btn:not(.arena-send)').trigger('click')
    expect(w.emitted('evolve')[0]).toEqual([{ from: 133, to: 135, key: 'github:a' }])
  })

  it('n’affiche aucune jauge pour une espèce terminale', () => {
    const w = mountSheet({ id: 143, entries: [capture('a', 143)], isDeadEnd: true })
    expect(w.find('.candy').exists()).toBe(false)
  })

  it('borne la jauge à 100 % au-delà du coût', () => {
    const w = mountSheet({ id: 1, entries: [capture('a', 1)], candies: 40, canEvolve: true })
    expect(w.find('.cbar-fill').attributes('style')).toContain('width: 100%')
  })
})

describe('sélection de l’exemplaire à évoluer', () => {
  const shinyAndNot = [capture('a', 1), capture('b', 1, { shiny: true })]

  it('pré-coche le chromatique par défaut', async () => {
    const w = mountSheet({
      id: 1, entries: shinyAndNot, available: shinyAndNot, candies: 9, canEvolve: true,
    })
    await w.find('.evo-btn:not(.arena-send)').trigger('click')
    const checked = w.findAll('input[type=radio]').find((i) => i.element.checked)
    expect(checked.element.value).toBe('github:b')
  })

  it('permet de choisir un autre exemplaire que celui pré-coché', async () => {
    const w = mountSheet({
      id: 1, entries: shinyAndNot, available: shinyAndNot, candies: 9, canEvolve: true,
    })
    await w.find('.evo-btn:not(.arena-send)').trigger('click')
    const radios = w.findAll('input[type=radio]')
    await radios.find((i) => i.element.value === 'github:a').setValue()
    await w.find('.evo-btn:not(.arena-send)').trigger('click')
    expect(w.emitted('evolve')[0]).toEqual([{ from: 1, to: 2, key: 'github:a' }])
  })

  it('affiche le sélecteur même avec un seul exemplaire disponible', async () => {
    const w = mountSheet({
      id: 1, entries: [capture('a', 1)], available: [capture('a', 1)], candies: 9, canEvolve: true,
    })
    await w.find('.evo-btn:not(.arena-send)').trigger('click')
    expect(w.findAll('.picker-row')).toHaveLength(1)
  })

  it('annule la sélection sans émettre d’évolution', async () => {
    const w = mountSheet({
      id: 1, entries: [capture('a', 1)], available: [capture('a', 1)], candies: 9, canEvolve: true,
    })
    await w.find('.evo-btn:not(.arena-send)').trigger('click')
    await w.find('.cancel-btn').trigger('click')
    expect(w.find('.picker-row').exists()).toBe(false)
    expect(w.emitted('evolve')).toBeUndefined()
  })

  it('revalide la sélection si l’exemplaire choisi disparaît de la liste pendant que le picker est ouvert', async () => {
    const ab = [capture('a', 1), capture('b', 1)]
    const w = mountSheet({ id: 1, entries: ab, available: ab, candies: 9, canEvolve: true })
    await w.find('.evo-btn:not(.arena-send)').trigger('click')
    // Pré-coché sur le premier disponible ('a', pas de chromatique ici).
    let checked = w.findAll('input[type=radio]').find((i) => i.element.checked)
    expect(checked.element.value).toBe('github:a')

    // L'autre appareil consomme 'a' entre-temps : un refresh() ne laisse plus que 'b'.
    await w.setProps({ available: [capture('b', 1)] })
    checked = w.findAll('input[type=radio]').find((i) => i.element.checked)
    expect(checked.element.value).toBe('github:b')

    await w.find('.evo-btn:not(.arena-send)').trigger('click')
    expect(w.emitted('evolve')[0]).toEqual([{ from: 1, to: 2, key: 'github:b' }])
  })
})

describe('la réserve', () => {
  it('présente les doublons d’une espèce sans évolution', () => {
    const w = mountSheet({ id: 143, entries: [capture('a', 143), capture('b', 143)], isDeadEnd: true })
    expect(w.find('.reserve').exists()).toBe(true)
    expect(w.find('.reserve-count').text()).toBe('2')
  })

  it('ne s’affiche pas pour une capture unique', () => {
    const w = mountSheet({ id: 143, entries: [capture('a', 143)], isDeadEnd: true })
    expect(w.find('.reserve').exists()).toBe(false)
  })

  it('plafonne la pile visuelle à douze', () => {
    const entries = Array.from({ length: 20 }, (_, i) => capture('s' + i, 143))
    const w = mountSheet({ id: 143, entries, isDeadEnd: true })
    expect(w.findAll('.press span')).toHaveLength(12)
    expect(w.find('.reserve-count').text()).toBe('20')
  })
})

describe('bonbons de famille — forme finale sans évolution propre', () => {
  it('Dracaufeu montre la jauge familiale sans bouton d’évolution ni réserve', () => {
    const w = mountSheet({ id: 6, entries: [capture('a', 6)], candies: 5, isDeadEnd: false })
    expect(w.find('.candy').exists()).toBe(true)
    expect(w.text()).toContain('Salamèche')
    expect(w.find('.candy-nums').text()).toBe('5')
    expect(w.find('.evo-btn:not(.arena-send)').exists()).toBe(false)
    expect(w.find('.evo-choices').exists()).toBe(false)
    expect(w.find('.reserve').exists()).toBe(false)
  })

  it('Dracaufeu sans doublon montre quand même la jauge (compteur familial, pas seulement les doublons)', () => {
    const w = mountSheet({ id: 6, entries: [capture('a', 6)], candies: 0, isDeadEnd: false })
    expect(w.find('.candy').exists()).toBe(true)
  })

  it('Bulbizarre garde son bouton d’évolution (non-régression)', () => {
    const w = mountSheet({ id: 1, entries: [capture('a', 1)], candies: 9, canEvolve: true, isDeadEnd: false })
    expect(w.find('.evo-btn:not(.arena-send)').exists()).toBe(true)
    expect(w.find('.reserve').exists()).toBe(false)
  })

  it('Ronflex garde sa réserve, sans jauge de bonbons', () => {
    const w = mountSheet({ id: 143, entries: [capture('a', 143), capture('b', 143)], isDeadEnd: true })
    expect(w.find('.reserve').exists()).toBe(true)
    expect(w.find('.candy').exists()).toBe(false)
  })

  // 151 espèces × 2 cardinalités = 302 montages, démontés au fur et à mesure pour ne pas
  // les accumuler dans jsdom. C'est légitimement long : le délai est donc déclaré
  // explicitement plutôt que laissé au défaut de 5 s, que ce test frôle même à froid.
  // Sans cela il échoue selon la charge de la machine ou la lenteur du runner — or la CI
  // le joue avant chaque déploiement.
  it('chaque espèce capturée retombe dans exactement une des trois sections, ou aucune', () => {
    for (const species of Object.values(DEX)) {
      const isDeadEnd = !hasEvoInFamily(species.id)
      const targets = species.to === null ? [] : Array.isArray(species.to) ? species.to : [species.to]

      for (const entryCount of [1, 2]) {
        const entries = Array.from({ length: entryCount }, (_, i) => capture('s' + i, species.id))
        const w = mountSheet({
          id: species.id,
          entries,
          candies: 0,
          canEvolve: false,
          isDeadEnd,
        })

        const evolving = targets.length > 0
        const finalForm = !evolving && !isDeadEnd
        const reserve = !evolving && isDeadEnd && entryCount > 1

        expect(w.find('.candy').exists()).toBe(evolving || finalForm)
        expect(w.find('.evo-btn:not(.arena-send)').exists() || w.find('.evo-choices').exists()).toBe(evolving)
        expect(w.find('.reserve').exists()).toBe(reserve)

        const renderedCount = [evolving, finalForm, reserve].filter(Boolean).length
        expect(renderedCount).toBeLessThanOrEqual(1)

        w.unmount()
      }
    }
  }, 60000)

  it('non capturée : aucune des trois sections ne s’affiche', () => {
    const w = mountSheet({ id: 6, entries: null, isDeadEnd: false })
    expect(w.find('.candy').exists()).toBe(false)
    expect(w.find('.reserve').exists()).toBe(false)
  })
})

describe('lignée', () => {
  const withLine = (id, caughtIds) =>
    mountSheet({ id, entries: [capture('a', id)], caughtIds: new Set(caughtIds) })

  it('déplie les trois étages d’une lignée droite', () => {
    const w = withLine(2, [1, 2])
    expect(w.findAll('.line-cell')).toHaveLength(3)
  })

  it('marque l’étape courante', () => {
    const w = withLine(2, [1, 2])
    const here = w.findAll('.line-cell').filter((c) => c.classes().includes('here'))
    expect(here).toHaveLength(1)
    expect(here[0].text()).toContain('Herbizarre')
  })

  // La lignée nomme ses étapes, y compris celles jamais rencontrées : c'est ce qui permet
  // de savoir vers quoi on avance. Ce n'est pas une divulgation — le bouton d'évolution
  // nomme déjà la cible deux sections plus bas, on ne peut pas évoluer à l'aveugle.
  it('nomme les étapes jamais rencontrées', () => {
    const w = withLine(2, [1, 2])
    const unseen = w.findAll('.line-cell').filter((c) => c.classes().includes('unseen'))
    expect(unseen).toHaveLength(1)
    expect(unseen[0].text()).toContain('Florizarre')
  })

  // Le sprite, lui, reste caché : c'est la découverte visuelle qui fait le moment de jeu,
  // pas le nom. La classe porte le filtre de silhouette, le même que celui du rituel.
  it('garde le sprite d’une étape jamais rencontrée en silhouette', () => {
    const w = withLine(2, [1, 2])
    const unseen = w.findAll('.line-cell').filter((c) => c.classes().includes('unseen'))
    expect(unseen[0].find('img').attributes('alt')).toBe('Florizarre, jamais rencontré')
  })

  it('porte le coût en bonbons sur chaque flèche', () => {
    const w = withLine(2, [1, 2])
    const costs = w.findAll('.line-cost').map((c) => c.text())
    expect(costs).toEqual(['8', '16']) // Bulbizarre → Herbizarre → Florizarre
  })

  it('range les trois évolutions d’Évoli sur un même étage', () => {
    const w = withLine(133, [133])
    expect(w.findAll('.line-cell')).toHaveLength(4)
    expect(w.findAll('.line-step')).toHaveLength(2)
    expect(w.findAll('.line-arrow')).toHaveLength(1)
  })

  // Une lignée d'une seule case n'apprend rien.
  it('se tait pour une famille solitaire', () => {
    expect(withLine(95, [95]).find('.line').exists()).toBe(false)
  })

  it('se tait sur une espèce jamais capturée', () => {
    const w = mountSheet({ id: 2, entries: null, caughtIds: new Set([1]) })
    expect(w.find('.line').exists()).toBe(false)
  })
})

describe('types', () => {
  it('affiche les deux types d’une espèce capturée', () => {
    const w = mountSheet({ id: 1, entries: [capture('a', 1)], caughtIds: new Set([1]) })
    expect(w.findAll('.type-chip').map((c) => c.text())).toEqual(['Plante', 'Poison'])
  })

  it('affiche le type unique d’une espèce mono-type', () => {
    const w = mountSheet({ id: 4, entries: [capture('a', 4)], caughtIds: new Set([4]) })
    expect(w.findAll('.type-chip').map((c) => c.text())).toEqual(['Feu'])
  })

  it('teinte chaque pastille par l’identifiant du type', () => {
    const w = mountSheet({ id: 1, entries: [capture('a', 1)], caughtIds: new Set([1]) })
    expect(w.findAll('.type-chip')[0].attributes('style')).toContain('--type-grass')
  })

  // Cohérent avec le nom déjà masqué : une silhouette ne divulgue rien.
  it('se tait sur une espèce jamais capturée', () => {
    expect(mountSheet({ id: 1, entries: null }).findAll('.type-chip')).toHaveLength(0)
  })
})

describe('fermeture', () => {
  it('émet close au bouton', async () => {
    const w = mountSheet({ id: 1 })
    await w.find('.x').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('émet close au clic sur le fond', async () => {
    const w = mountSheet({ id: 1 })
    await w.find('.scrim').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })
})

describe('notice', () => {
  it('affiche le texte de Pokédex d’une espèce capturée', () => {
    const w = mountSheet({ id: 1, entries: [capture('a', 1)], caughtIds: new Set([1]) })
    expect(w.find('.dexnote').text().length).toBeGreaterThan(10)
  })

  it('se tait sur une espèce jamais capturée', () => {
    expect(mountSheet({ id: 1, entries: null }).find('.dexnote').exists()).toBe(false)
  })

  it('est la dernière section du panneau', () => {
    const w = mountSheet({ id: 1, entries: [capture('a', 1)], caughtIds: new Set([1]) })
    const sections = w.findAll('.sect')
    expect(sections[sections.length - 1].find('.dexnote').exists()).toBe(true)
  })
})

/**
 * Engager depuis la fiche est le geste naturel : on regarde son Dracaufeu et on décide de
 * l'envoyer. Passer par l'écran d'arène restait possible, mais obligeait à retrouver dans une
 * grille le Pokémon qu'on avait justement sous les yeux.
 */
describe('envoi à l’arène depuis la fiche', () => {
  const dispo = [{ key: 'github:a', via: 'catch', source: 'github', label: 'a', date: '2026-01-01', species: 6 }]

  it('propose d’envoyer l’exemplaire au duel', async () => {
    const w = mountSheet({ id: 6, entries: dispo, available: dispo, arenaCredits: 2 })
    const bouton = w.find('.arena-send')
    expect(bouton.exists()).toBe(true)
    await bouton.trigger('click')
    expect(w.emitted('engage')[0]).toEqual(['github:a'])
  })

  // Le bouton choisit, il n'engage pas : engager depuis la fiche mettait un Pokémon en jeu
  // avant que le joueur ait vu ses options, et l'arène s'ouvrait alors sans rien à décider.
  it('annonce qu’il ouvre l’arène plutôt qu’il n’engage', () => {
    const w = mountSheet({ id: 6, entries: dispo, available: dispo, arenaCredits: 2 })
    expect(w.text()).toContain('Ouvre l’arène avec cet exemplaire retenu')
    expect(w.find('.arena-send').text()).toBe('Choisir pour l’arène')
  })

  it('empêche l’envoi sans engagement disponible, et explique pourquoi', () => {
    const w = mountSheet({ id: 6, entries: dispo, available: dispo, arenaCredits: 0 })
    expect(w.find('.arena-send').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('un par jour ouvré')
  })

  it('ne propose rien quand il ne reste aucun exemplaire disponible', () => {
    const w = mountSheet({ id: 6, entries: dispo, available: [], arenaCredits: 2 })
    expect(w.find('.arena-send').exists()).toBe(false)
  })
})

/**
 * La forme du jour, sur la fiche. Elle entre dans le calcul de puissance au même titre que le
 * niveau, et n'était lisible que dans l'arène : il fallait donc ouvrir un autre écran pour
 * savoir si le moment était bon pour engager celui qu'on avait sous les yeux.
 */
describe('la forme du jour sur la fiche', () => {
  const FORMES = {
    'github:a': { name: 'vaillant', factor: 1.05 },
    'github:b': { name: 'épuisé', factor: 0.9 },
  }
  const deuxExemplaires = [capture('a', 1), capture('b', 1)]
  const monterAvecFormes = (props = {}) => mountSheet({
    entries: deuxExemplaires, available: deuxExemplaires,
    arenaFormOf: (key) => FORMES[key] ?? { name: 'normal', factor: 1 },
    ...props,
  })

  // À plusieurs exemplaires, les formes diffèrent — elle se tire de la clé, pas de l'espèce —
  // et c'est précisément ce qui décide lequel engager aujourd'hui.
  it('donne sa forme à chaque exemplaire, pas une pour l’espèce', () => {
    const w = monterAvecFormes()
    const lignes = w.findAll('.forme-ligne')
    expect(lignes).toHaveLength(2)
    const noms = lignes.map((l) => l.find('.forme-nom').text())
    expect(new Set(noms).size).toBeGreaterThan(1)
  })

  it('distingue à l’œil ce qui aide de ce qui handicape', () => {
    const w = monterAvecFormes()
    expect(w.findAll('.forme-nom.up').length).toBeGreaterThan(0)
    expect(w.findAll('.forme-nom.down').length).toBeGreaterThan(0)
  })

  // Avant l'ouverture de l'arène, la forme ne veut encore rien dire : l'afficher poserait une
  // question à laquelle rien ne répond.
  it('ne montre rien tant que l’arène n’a pas ouvert', () => {
    const w = mountSheet({ entries: deuxExemplaires, available: deuxExemplaires })
    expect(w.find('.formes').exists()).toBe(false)
  })
})
