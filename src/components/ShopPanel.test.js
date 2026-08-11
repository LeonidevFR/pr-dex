import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ShopPanel from './ShopPanel.vue'

const monter = (props = {}) =>
  mount(ShopPanel, { props: { pokedollars: 10000, shop: [], ...props } })

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

    const enBoutique = async (props = {}) => monter({ shop: catalogue, ...props })

  it('nomme chaque article par ce qu’il donne', async () => {
    const w = await enBoutique()
    expect(w.text()).toContain('Pli commun')
    expect(w.text()).toContain('Pli rare · Gen 2 · inédit garanti')
  })

  it('achète l’article demandé', async () => {
    const w = await enBoutique({ pokedollars: 10000 })
    await w.findAll('.evo-btn')[0].trigger('click')
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

  // La promesse a changé : le pli s'ouvre dès que la collecte le rapporte, et l'écran ne doit
  // plus faire croire à une attente systématique.
  it('dit quand le pli s’ouvre, et ce qu’il advient s’il tarde', async () => {
    const w = await enBoutique()
    expect(w.text()).toContain('s’ouvre dès que la collecte le rapporte')
    expect(w.text()).toContain('au prochain passage')
  })

  it('rappelle que les cotes ne changent pas', async () => {
    const w = await enBoutique()
    expect(w.text()).toContain('aux mêmes cotes')
  })
})


/**
 * Un pli légendaire coûte plusieurs semaines de duels, et la dépense est définitive : le
 * premier clic ne doit rien débiter.
 */
describe('confirmation d’achat', () => {
  const CATALOGUE = [{ slug: 'gen1-l', gen: 1, tier: 'l', fresh: false, price: 4500 }]
  const panel = () => monter({ shop: CATALOGUE, pokedollars: 14000 })
  const article = (w) => w.findAll('.log-row')[0].find('button')

  it('ne déclenche rien au premier clic', async () => {
    const w = panel()
    await article(w).trigger('click')
    expect(w.emitted('buy')).toBeUndefined()
  })

  it('dit le prix à confirmer, pour qu’on confirme ce qu’on paie', async () => {
    const w = panel()
    await article(w).trigger('click')
    expect(article(w).text()).toContain(String(CATALOGUE[0].price))
  })

  it('achète au second clic', async () => {
    const w = panel()
    await article(w).trigger('click')
    await article(w).trigger('click')
    expect(w.emitted('buy')[0]).toEqual([CATALOGUE[0].slug])
  })

  it('renonce si on clique ailleurs', async () => {
    const w = panel()
    await article(w).trigger('click')
    await w.find('.panel').trigger('click')
    await article(w).trigger('click')
    expect(w.emitted('buy')).toBeUndefined()
  })
})
