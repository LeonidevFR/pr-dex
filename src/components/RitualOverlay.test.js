import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import RitualOverlay from './RitualOverlay.vue'
import { useCollection } from '../composables/useCollection.js'
import { loadDemoClient } from '../fixtures/demo.js'
import { entryKey } from '../../shared/entry.js'

// `key` est dérivée plutôt que codée en dur : surcharger `external_id` doit suffire à obtenir
// un exemplaire distinct, sans avoir à penser à mettre la clé à jour avec.
const entryOf = (over = {}) => {
  const entry = {
    source: 'github', external_id: 'a3f8c21e9b4d',
    label: 'fix: race condition', ref: 'moi/atlas#142 · a3f8c21',
    url: 'https://github.com/moi/atlas/pull/142',
    date: '2026-02-03', species: 25, shiny: false, via: 'catch', ...over,
  }
  return { key: entryKey(entry.source, entry.external_id), ...entry }
}

const catchOf = (id, species, over = {}) => entryOf({ external_id: id, species, ...over })

const fakeClient = (catches, claimed) => {
  let state = { claimed, spent: {}, evolutions: [] }
  return {
    readCatches: async () => catches,
    readState: async () => ({ state: JSON.parse(JSON.stringify(state)), blobSha: 'blob' }),
    writeState: async (next) => { state = JSON.parse(JSON.stringify(next)); return { blobSha: 'blob' } },
  }
}

const mountRitual = (props = {}) =>
  mount(RitualOverlay, { props: { entry: entryOf(), remaining: 1, ...props } })

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

// Ouvrir un pli, c'est le cliquer puis laisser l'entaille courir : le pli ne cède qu'après.
// Les tests qui portent sur l'entaille elle-même n'utilisent pas cet assistant, exprès.
const ouvrir = async (w) => {
  await w.find('.packet').trigger('click')
  vi.advanceTimersByTime(1180)
  await w.vm.$nextTick()
  return w
}

// Retourner la carte est un geste distinct de l'ouverture : c'est tout l'intérêt du changement.
const retourner = async (w) => {
  await w.findComponent({ name: 'PokeCard' }).vm.$emit('activate')
  await w.vm.$nextTick()
  return w
}

// Révéler, c'est ouvrir le pli PUIS retourner la carte — le geste appartient au joueur.
const reveler = async (w) => retourner(await ouvrir(w))

describe('pli scellé', () => {
  it('porte le libellé de la capture et la référence donnée par sa source', () => {
    const w = mountRitual()
    expect(w.find('.pkt-title').text()).toBe('fix: race condition')
    expect(w.find('.pkt-pr').text()).toContain('moi/atlas#142 · a3f8c21')
  })

  // Une source peut n'avoir aucune référence courte à donner : le pli doit rester lisible.
  it('se passe de la ligne de référence quand la source n’en fournit pas', () => {
    const w = mountRitual({ entry: entryOf({ source: 'crm', ref: null }) })
    expect(w.find('.pkt-pr').exists()).toBe(false)
    expect(w.find('.pkt-title').text()).toBe('fix: race condition')
  })

  it('ne révèle rien avant d’être ouvert', () => {
    const w = mountRitual()
    expect(w.find('.reveal').exists()).toBe(false)
    expect(w.text()).not.toContain('Pikachu')
  })

  it('annonce le dernier pli', () => {
    expect(mountRitual({ remaining: 1 }).find('.queue-note').text()).toBe('dernier pli')
  })

  it('annonce la file restante', () => {
    expect(mountRitual({ remaining: 3 }).find('.queue-note').text()).toBe('3 plis en attente')
  })

  it('empile des plis fantômes selon la file', () => {
    expect(mountRitual({ remaining: 1 }).findAll('.ghost-pkt')).toHaveLength(0)
    expect(mountRitual({ remaining: 2 }).findAll('.ghost-pkt')).toHaveLength(1)
    expect(mountRitual({ remaining: 3 }).findAll('.ghost-pkt')).toHaveLength(2)
  })
})

describe('ouverture', () => {
  it('réclame la capture dès que le sceau est brisé', async () => {
    const w = mountRitual()
    await ouvrir(w)
    expect(w.emitted('claim')[0]).toEqual(['github:a3f8c21e9b4d'])
  })

  // Ce que la silhouette faisait — retenir l'information — la carte le fait mieux : elle est
  // là, tenue à l'envers, et c'est le joueur qui décide quand elle se retourne.
  it('sort la carte dos visible, et ne divulgue rien', async () => {
    const w = mountRitual()
    await ouvrir(w)
    expect(w.findComponent({ name: 'PokeCard' }).props('flipped')).toBe(true)
    expect(w.find('.reveal-name').exists()).toBe(false)
    // La face avant reste dans le DOM — il faut bien la retourner. Elle est cachée aux
    // lecteurs d'écran, sans quoi la révélation ne vaudrait que pour les voyants.
    expect(w.find('.pkc-front').attributes('aria-hidden')).toBe('true')
  })

  it('révèle au clic sur la carte, sans attendre', async () => {
    const w = mountRitual()
    await reveler(w)
    expect(w.findComponent({ name: 'PokeCard' }).props('flipped')).toBe(false)
    expect(w.find('.reveal-name').text()).toBe('Pikachu')
  })

  // Le filet, pour qui a posé son téléphone. Pas pour qui attend.
  it('se retourne seule au bout de quatre secondes', async () => {
    const w = mountRitual()
    await ouvrir(w)

    vi.advanceTimersByTime(3999)
    await w.vm.$nextTick()
    expect(w.find('.reveal-name').exists()).toBe(false)

    vi.advanceTimersByTime(1)
    await w.vm.$nextTick()
    expect(w.find('.reveal-name').text()).toBe('Pikachu')
  })

  // Sans annulation, le minuteur rejouerait la révélation par-dessus une carte déjà retournée.
  it('annule le retournement automatique quand le joueur a cliqué', async () => {
    const w = mountRitual()
    await reveler(w)
    vi.advanceTimersByTime(5000)
    await w.vm.$nextTick()
    expect(w.findAll('.reveal-name')).toHaveLength(1)
  })

  it('annonce le décompte tant que la carte attend', async () => {
    const w = mountRitual()
    await ouvrir(w)
    expect(w.find('.reveal-hint').text()).toContain('Cliquer pour retourner')

    await w.findComponent({ name: 'PokeCard' }).vm.$emit('activate')
    await w.vm.$nextTick()
    expect(w.find('.reveal-hint').exists()).toBe(false)
  })
})

/**
 * Le défaut le plus vicieux de la première version : la scène prenait les couleurs du palier
 * dès la déchirure. On lisait donc la réponse dans les rayons — et dans le fond, et dans le
 * halo de la carte — avant même d'avoir retourné quoi que ce soit. Le geste ne servait plus
 * à rien, et l'attente non plus.
 */
describe('la scène ne vend pas la mèche', () => {
  const decorAvantRetournement = async (species) => {
    const w = mountRitual({ entry: entryOf({ species }) })
    await ouvrir(w)
    const ritual = w.find('.ritual')
    return { style: ritual.attributes('style'), classes: ritual.classes() }
  }

  it('affiche le même décor pour un commun et pour un légendaire, dos visible', async () => {
    const commun = await decorAvantRetournement(19)
    const legendaire = await decorAvantRetournement(144)

    const decor = (s) => (s.match(/--ray[^;]*;|--wedge[^;]*;|--glow[^;]*;/g) ?? []).join('')
    expect(decor(legendaire.style)).toBe(decor(commun.style))
  })

  it('ne marque pas la scène légendaire avant la révélation', async () => {
    const legendaire = await decorAvantRetournement(144)
    expect(legendaire.classes).not.toContain('leg')
  })

  it('ne prend les couleurs du palier qu’une fois la carte retournée', async () => {
    const w = mountRitual({ entry: entryOf({ species: 144 }) })
    await ouvrir(w)
    const avant = w.find('.ritual').attributes('style')

    await retourner(w)
    const apres = w.find('.ritual').attributes('style')
    expect(apres).not.toBe(avant)
    expect(apres).toContain('--glow: 60px')
    expect(w.find('.ritual').classes()).toContain('leg')
  })
})

describe('échelle d’intensité', () => {
  // Mesuré APRÈS le retournement : avant, la scène est volontairement neutre.
  const sceneDe = async (species) => {
    const w = mountRitual({ entry: entryOf({ species }) })
    await reveler(w)
    return w.find('.ritual').attributes('style')
  }

  // Un disque unique, dont l'opacité — pas la vitesse — porte l'écart entre paliers.
  it('n’a qu’un disque de rayons, quel que soit le palier', async () => {
    for (const species of [19, 20, 1, 144]) {
      const w = mountRitual({ entry: entryOf({ species }) })
      await ouvrir(w)
      expect(w.findAll('.rays')).toHaveLength(1)
    }
  })

  it('monte l’opacité des rayons avec le palier', async () => {
    const op = async (species) => Number(/--rayop:\s*([\d.]+)/.exec(await sceneDe(species))[1])
    expect(await op(19)).toBeLessThan(await op(20))    // commun < peu commun
    expect(await op(20)).toBeLessThan(await op(1))     // peu commun < rare
    expect(await op(1)).toBeLessThan(await op(144))    // rare < légendaire
  })

  // Des rayons plus fins et plus nombreux en haut de l'échelle : c'est ce qui fait « gravure »
  // plutôt que « gros disque ».
  it('affine les rayons avec le palier', async () => {
    const wedge = async (species) => Number(/--wedge:\s*([\d.]+)deg/.exec(await sceneDe(species))[1])
    expect(await wedge(144)).toBeLessThan(await wedge(1))
    expect(await wedge(1)).toBeLessThan(await wedge(19))
  })

  it('monte le halo avec le palier', async () => {
    expect(await sceneDe(19)).toContain('--glow: 8px')    // commun
    expect(await sceneDe(20)).toContain('--glow: 16px')   // peu commun
    expect(await sceneDe(1)).toContain('--glow: 38px')    // rare
    expect(await sceneDe(144)).toContain('--glow: 60px')  // légendaire
  })

  it('marque la scène légendaire une fois révélée', async () => {
    const w = mountRitual({ entry: entryOf({ species: 144 }) })
    await reveler(w)
    expect(w.find('.ritual').classes()).toContain('leg')
    expect(w.find('.reveal-banner').text()).toContain('Légendaire')
  })

  // La salve n'est plus un interrupteur « gros palier ou non » : elle est graduée. Le détail
  // du barème est vérifié par la suite « fanfare » ; ici on tient juste l'ordre des paliers.
  it('gradue la salve selon le palier au lieu de l’allumer d’un coup', async () => {
    const burst = async (species) => {
      const w = mountRitual({ entry: entryOf({ species }) })
      await reveler(w)
      return w.findAll('.fx-spark').length
    }
    expect(await burst(19)).toBe(0)                            // commun : rien
    expect(await burst(20)).toBeGreaterThan(0)                 // peu commun : un peu
    expect(await burst(1)).toBeGreaterThan(await burst(20))    // rare : davantage
    expect(await burst(144)).toBeGreaterThan(await burst(1))   // légendaire : le maximum
  })
})

describe('chromatique', () => {
  it('marque la carte, et fait scintiller la révélation', async () => {
    const w = mountRitual({ entry: entryOf({ shiny: true }) })
    await ouvrir(w)
    // Le chromatique se voit sur la carte elle-même, dès qu'elle est là — plus besoin d'une
    // ligne de texte pour teaser l'attente, puisqu'il n'y a plus d'attente subie.
    expect(w.find('.pkc').classes()).toContain('is-shiny')

    await retourner(w)
    expect(w.find('.reveal-banner').text()).toContain('Chromatique')
    // Pikachu est commun : sans traitement particulier, un chromatique commun serait muet.
    // Il relève le plancher de la fanfare, sinon on tairait la seule chose rare du tirage.
    expect(w.findAll('.fx-spark').length).toBeGreaterThan(0)
    expect(w.find('.pkc-art img').attributes('src')).toContain('/shiny/')
  })

  it('prime le chromatique sur le légendaire dans le bandeau', async () => {
    const w = mountRitual({ entry: entryOf({ species: 144, shiny: true }) })
    await reveler(w)
    expect(w.find('.reveal-banner').text()).toContain('Chromatique')
  })
})

describe('espèce jamais rencontrée', () => {
  const reveal = async (props) => reveler(mountRitual(props))

  it('marque la révélation d’une espèce nouvelle', async () => {
    const w = await reveal({ isNew: true })
    expect(w.find('.new-chip').text()).toBe('Nouveau')
    expect(w.find('.reveal-note').text()).toContain('Première entrée à la planche')
  })

  it('ne marque rien pour une espèce déjà à la planche', async () => {
    const w = await reveal({ isNew: false })
    expect(w.find('.new-chip').exists()).toBe(false)
    expect(w.find('.reveal-note').text()).toContain('Déjà à la planche')
  })

  it('ne suppose rien quand la propriété est absente', async () => {
    const w = await reveal()
    expect(w.find('.new-chip').exists()).toBe(false)
  })

  it('ne divulgue rien avant le retournement — le pli scellé et le dos restent muets', async () => {
    const w = mountRitual({ isNew: true })
    expect(w.text()).not.toContain('Nouveau')
    await ouvrir(w)
    expect(w.findComponent({ name: 'PokeCard' }).props('flipped')).toBe(true)
    expect(w.text()).not.toContain('Nouveau')
  })

  it('cohabite avec le palier et le chromatique sans les remplacer', async () => {
    const w = await reveal({ entry: entryOf({ species: 144, shiny: true }), isNew: true })
    expect(w.find('.new-chip').exists()).toBe(true)
    expect(w.find('.shiny-chip').exists()).toBe(true)
    expect(w.findAll('.chip')).toHaveLength(3)
  })
})

describe('suite de la file', () => {
  it('propose le retour quand c’est le dernier', async () => {
    const w = mountRitual({ remaining: 1 })
    await reveler(w)
    expect(w.find('.next-btn').text()).toBe('Retour à la planche')
    expect(w.findAll('button.queue-note')).toHaveLength(0)
  })

  it('décompte les plis restants après celui-ci', async () => {
    const w = mountRitual({ remaining: 3 })
    await reveler(w)
    expect(w.find('.next-btn').text()).toContain('2 restants')
  })

  it('accorde le singulier à un seul pli restant', async () => {
    const w = mountRitual({ remaining: 2 })
    await reveler(w)
    expect(w.find('.next-btn').text()).toContain('1 restant')
    expect(w.find('.next-btn').text()).not.toContain('restants')
  })

  it('émet next et skip-all', async () => {
    const w = mountRitual({ remaining: 3 })
    await reveler(w)
    await w.find('.next-btn').trigger('click')
    expect(w.emitted('next')).toBeTruthy()
    await w.find('button.queue-note').trigger('click')
    expect(w.emitted('skip-all')).toBeTruthy()
  })
})

describe('fermeture anticipée', () => {
  it('permet de revenir à la planche depuis le pli scellé, plis restants ou non', () => {
    const w = mountRitual({ remaining: 3 })
    expect(w.find('.ritual-close').exists()).toBe(true)
  })

  it('permet de revenir à la planche pendant la révélation, sans avoir tout ouvert', async () => {
    const w = mountRitual({ remaining: 3 })
    await reveler(w)
    await w.find('.ritual-close').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('n’émet pas skip-all ni next en fermant', async () => {
    const w = mountRitual({ remaining: 3 })
    await w.find('.ritual-close').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
    expect(w.emitted('skip-all')).toBeFalsy()
    expect(w.emitted('next')).toBeFalsy()
  })
})

describe('intégration — file réelle (App.vue ne doit pas décompter sous le composant)', () => {
  it('annonce le bon nombre de plis restants une fois le sceau brisé', async () => {
    const col = useCollection()
    await col.load(loadDemoClient())
    const entry = col.dex.pending.value[0]
    const remaining = ref(col.dex.pending.value.length) // figé comme dans App.vue

    const w = mount({
      components: { RitualOverlay },
      setup: () => ({ col, entry, remaining }),
      template: `<RitualOverlay :entry="entry" :remaining="remaining" @claim="col.claim" />`,
    })
    // Dérivé de la file réelle plutôt que codé en dur : la démo peut gagner ou perdre un pli
    // sans que ce test, qui porte sur le décompte et non sur son contenu, ait à bouger.
    const attendu = remaining.value - 1
    await reveler(w)

    expect(w.find('.next-btn').text()).toContain(`${attendu} restants`)
    expect(col.dex.pending.value).toHaveLength(attendu)
  })

  // `claim` inscrit l'espèce au dex dès le sceau brisé : lue trop tard, la question
  // « jamais rencontrée ? » répond toujours non et le marqueur ne s'allume jamais.
  it('marque la nouveauté lue avant le claim, pas après', async () => {
    const col = useCollection()
    await col.load(fakeClient([catchOf('a', 25)], []))
    const entry = col.dex.pending.value[0]
    const isNew = ref(col.dex.isNewSpecies(entry.species)) // figé comme dans App.vue

    const w = mount({
      components: { RitualOverlay },
      setup: () => ({ col, entry, isNew }),
      template: `<RitualOverlay :entry="entry" :remaining="1" :is-new="isNew" @claim="col.claim" />`,
    })
    await reveler(w)

    expect(col.dex.isNewSpecies(25)).toBe(false) // le claim l'a déjà inscrite
    expect(w.find('.new-chip').exists()).toBe(true)
  })

  it('ne marque pas le second pli d’une espèce ouverte au pli précédent', async () => {
    const col = useCollection()
    await col.load(fakeClient([catchOf('a', 25), catchOf('b', 25, { date: '2026-02-04' })], []))

    const first = col.dex.pending.value[0]
    expect(col.dex.isNewSpecies(first.species)).toBe(true)
    await col.claim(first.key)

    const second = col.dex.pending.value[0]
    expect(second.external_id).toBe('b')
    expect(col.dex.isNewSpecies(second.species)).toBe(false)
  })
})

describe('focus clavier', () => {
  // Monté dans le document : `document.activeElement` ne bouge pas sur un arbre détaché.
  const mountAttached = (props = {}) =>
    mount(RitualOverlay, { props: { entry: entryOf(), remaining: 1, ...props }, attachTo: document.body })

  afterEach(() => { document.body.innerHTML = '' })

  it('pose le focus sur le pli à l’ouverture', () => {
    const w = mountAttached()
    expect(document.activeElement).toBe(w.find('.packet').element)
  })

  it('pose le focus sur le bouton suivant une fois révélé', async () => {
    const w = mountAttached()
    await reveler(w)
    await w.vm.$nextTick()
    expect(document.activeElement).toBe(w.find('.next-btn').element)
  })

  /**
   * Renversement par rapport à l'ancienne silhouette, qui ne focalisait rien parce qu'elle
   * imposait une attente : la carte, elle, porte l'action. Sans focus, on réserverait le
   * retournement à la souris.
   */
  it('pose le focus sur la carte, qui porte désormais l’action', async () => {
    const w = mountAttached()
    await ouvrir(w)
    await w.vm.$nextTick()
    expect(document.activeElement).toBe(w.find('.pkc').element)
  })

  /**
   * Tout le rituel doit se jouer à la barre d'espace, du premier pli au dernier. Le pli est un
   * vrai `<button>`, donc Espace l'ouvre nativement ; la carte est un `div` focalisable où il
   * ne se passait rien. Sans ce test, on ouvre au clavier mais on retourne à la souris.
   */
  it('se joue entièrement à la barre d’espace', async () => {
    const w = mountAttached()
    expect(document.activeElement).toBe(w.find('.packet').element)

    await w.find('.packet').trigger('keyup.space')
    await w.find('.packet').trigger('click') // ce qu'Espace déclenche nativement sur un bouton
    vi.advanceTimersByTime(1180)
    await w.vm.$nextTick()
    await w.vm.$nextTick()

    expect(document.activeElement).toBe(w.find('.pkc').element)
    await w.find('.pkc').trigger('keyup.space')
    expect(w.find('.reveal-name').exists()).toBe(true)
  })
})

describe('entaille du sceau', () => {
  // Ces trois tests portent sur l'entaille elle-même : ils cliquent à la main, sans l'assistant.
  // L'entaille court, le bandeau part, puis le reste du pli cède : la carte n'entre qu'après.
  it('entaille le pli, puis le déchire, puis sort la carte', async () => {
    const w = mountRitual()
    await w.find('.packet').trigger('click')
    expect(w.find('.packet').classes()).toContain('cutting')
    expect(w.find('.reveal').exists()).toBe(false)

    vi.advanceTimersByTime(760)
    await w.vm.$nextTick()
    expect(w.find('.packet').exists()).toBe(true)   // il se déchire encore
    expect(w.find('.reveal').exists()).toBe(false)

    vi.advanceTimersByTime(420)
    await w.vm.$nextTick()
    expect(w.find('.packet').exists()).toBe(false)
    expect(w.find('.pkc').exists()).toBe(true)
  })

  // Le sceau ne se brise qu'une fois : re-cliquer pendant l'entaille relancerait la séquence,
  // et réclamerait la capture une seconde fois.
  it('ne se laisse pas rouvrir pendant qu’il s’ouvre', async () => {
    const w = mountRitual()
    await w.find('.packet').trigger('click')
    await w.find('.packet').trigger('click')
    expect(w.emitted('claim')).toHaveLength(1)
  })

  it('inscrit la capture dès le sceau brisé, sans attendre que le pli cède', async () => {
    const w = mountRitual()
    await w.find('.packet').trigger('click')
    expect(w.emitted('claim')).toHaveLength(1)
  })
})

describe('fanfare', () => {
  const auRetournement = async (species) => reveler(mountRitual({ entry: entryOf({ species }) }))

  /**
   * Un commun ne déclenche rien. C'est ce silence qui donne sa valeur au reste : si chaque
   * tirage explose, l'explosion du légendaire ne veut plus rien dire — et on ouvre ces plis
   * quelques centaines de fois par an.
   */
  it('reste muette sur un commun', async () => {
    const w = await auRetournement(19)
    expect(w.findAll('.fx-spark')).toHaveLength(0)
    expect(w.findAll('.fx-ring')).toHaveLength(0)
    expect(w.find('.flash').exists()).toBe(false)
    expect(w.find('.ritual').classes()).not.toContain('shaking')
  })

  it('monte avec le palier', async () => {
    const peuCommun = await auRetournement(20)
    const rare = await auRetournement(1)
    const legendaire = await auRetournement(144)

    const etincelles = (w) => w.findAll('.fx-spark').length
    expect(etincelles(peuCommun)).toBeGreaterThan(0)
    expect(etincelles(rare)).toBeGreaterThan(etincelles(peuCommun))
    expect(etincelles(legendaire)).toBeGreaterThan(etincelles(rare))

    // Les ondes et la secousse sont réservées au haut de l'échelle : elles ne se diluent pas.
    expect(peuCommun.findAll('.fx-ring')).toHaveLength(0)
    expect(legendaire.findAll('.fx-ring').length).toBeGreaterThan(rare.findAll('.fx-ring').length)
    expect(peuCommun.find('.ritual').classes()).not.toContain('shaking')
    expect(legendaire.find('.ritual').classes()).toContain('shaking')
  })

  // La récompense appartient au moment où l'information arrive, pas à celui où le pli cède.
  it('ne part qu’au retournement, et une seule fois', async () => {
    const w = mountRitual({ entry: entryOf({ species: 1 }) })
    await ouvrir(w)
    expect(w.findAll('.fx-spark')).toHaveLength(0)

    await retourner(w)
    const salve = w.findAll('.fx-spark').length
    expect(salve).toBeGreaterThan(0)

    vi.advanceTimersByTime(5000)
    await w.vm.$nextTick()
    expect(w.findAll('.fx-spark')).toHaveLength(salve)
  })

  // Deux tirages du même palier doivent produire la même salve : c'est un décor, pas un tirage.
  it('place ses étincelles de façon déterministe', async () => {
    const a = await auRetournement(144)
    const b = await auRetournement(144)
    const positions = (w) => w.findAll('.fx-spark').map((s) => s.attributes('style'))
    expect(positions(a)).toEqual(positions(b))
  })
})

describe('vitesse des rayons', () => {
  // Un rare tournait en 3,2 s et un légendaire en 1,8 s : c'est stroboscopique, et le rituel se
  // rejoue quelques centaines de fois par an sans qu'on puisse le désactiver. L'intensité passe
  // par l'opacité, le nombre de couches et le halo — jamais par la vitesse.
  it('ne descend jamais sous dix secondes par tour, quel que soit le palier', async () => {
    for (const species of [16, 25, 6, 151]) {
      const w = mountRitual({ entry: entryOf({ species }) })
      await ouvrir(w)
      const secondes = Number(/--rayspeed:\s*([\d.]+)s/.exec(w.find('.ritual').attributes('style'))[1])
      expect(secondes).toBeGreaterThanOrEqual(10)
    }
  })
})
