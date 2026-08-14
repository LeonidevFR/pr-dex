import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SettingsPanel from './SettingsPanel.vue'


/**
 * Le pseudonyme est la seule donnée personnelle qu'un adversaire lira, et sans lui on n'existe
 * pas dans l'arène : les vues publiques écartent les profils anonymes, si bien qu'on n'apparaît
 * ni au classement, ni dans les défis autrement que « Sans nom ». Rien ne permettait de le
 * choisir — l'application le lisait partout et ne l'écrivait nulle part.
 */
describe('le nom dans l’arène', () => {
  const reglages = (props = {}) => mount(SettingsPanel, {
    props: { githubLogin: 'leo', ...props },
  })

  const saisir = async (w, valeur) => {
    await w.find('.pseudo-input').setValue(valeur)
    return w
  }

  it('réclame un nom tant qu’on n’en a pas', () => {
    expect(reglages().text()).toContain('à choisir')
    expect(reglages({ pseudo: 'leo' }).text()).not.toContain('à choisir')
  })

  it('explique à quoi il sert avant de le demander', () => {
    expect(reglages().text()).toContain('ni au\n          classement'.replace(/\s+/g, ' '))
  })

  it('enregistre le nom saisi, débarrassé de ses espaces', async () => {
    const w = await saisir(reglages(), '  Marion  ')
    await w.find('form').trigger('submit')
    expect(w.emitted('set-pseudo')[0]).toEqual(['Marion'])
  })

  // Un nom qu'on va coller à côté d'un badge et dans une URL de profil doit se retaper sans
  // hésiter : bornes étroites, et refus expliqué plutôt que bouton mort.
  it('refuse ce qui ne tiendrait pas dans une URL, et dit pourquoi', async () => {
    const w = await saisir(reglages(), 'a')
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('De deux à vingt signes')

    await saisir(w, 'marion/leo')
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('accepte les accents, qu’un prénom français réclame', async () => {
    const w = await saisir(reglages(), 'Amélie')
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  /**
   * L'unicité de la base ignore la casse et les espaces : dans une arène où l'on choisit son
   * adversaire sur la foi d'un nom, `Leo` et `leo` côte à côte suffisent à se faire passer pour
   * l'autre. Le refus doit donc s'expliquer, sinon il passe pour un caprice.
   */
  it('explique un nom déjà pris, casse comprise', () => {
    expect(reglages({ pseudoError: 'taken' }).text()).toContain('déjà pris')
    expect(reglages({ pseudoError: 'taken' }).text()).toContain('comptent pour le même')
  })

  it('distingue un refus d’une panne', () => {
    expect(reglages({ pseudoError: 'server' }).text()).toContain('Réessaie')
  })

  it('ne propose pas d’enregistrer un nom inchangé', async () => {
    const w = reglages({ pseudo: 'leo' })
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    await saisir(w, 'leon')
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })
})

/**
 * Le champ démarrait vide. Au lancement, personne n'aurait eu de nom tant qu'il n'aurait pas
 * trouvé cet écran — donc un classement vide et des défis anonymes, alors que tout le monde est
 * déjà connu au travail sous son login GitHub.
 */
describe('la suggestion du login GitHub', () => {
  const reglages = (props = {}) => mount(SettingsPanel, {
    props: { githubLogin: 'leo', ...props },
  })

  it('propose le login GitHub tant qu’aucun nom n’est choisi', () => {
    expect(reglages().find('.pseudo-input').element.value).toBe('leo')
  })

  // Proposé, jamais imposé : c'est la seule donnée qu'un adversaire lira, et la publier reste
  // un geste volontaire. Rien n'est écrit tant qu'on n'a pas confirmé.
  it('ne l’enregistre pas tout seul', () => {
    expect(reglages().emitted('set-pseudo')).toBeUndefined()
  })

  it('laisse la main au nom déjà choisi', () => {
    expect(reglages({ pseudo: 'marion' }).find('.pseudo-input').element.value).toBe('marion')
  })

  // Un login GitHub peut porter des signes que la borne refuse : la suggestion doit rester
  // soumissible telle quelle, sinon elle propose une impasse.
  it('nettoie une suggestion que la règle refuserait', () => {
    const w = reglages({ githubLogin: 'leo@guest suite' })
    expect(w.find('.pseudo-input').element.value).toBe('leoguestsuite')
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })
})
