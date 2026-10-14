import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AchievementsView from './AchievementsView.vue'

const OWNED = {
  'deja-vu': { code: 'deja-vu', unlocked_at: '2026-09-02', trigger_key: 'github:b', announced: true },
  'species-100': { code: 'species-100', unlocked_at: '2026-09-21', trigger_key: 'github:c', announced: true },
}
const mountView = (props = {}) => mount(AchievementsView, {
  props: {
    owned: OWNED, counts: { 'deja-vu': 4, 'species-100': 1, 'hot-hand': 3 },
    progress: { 'species-140': { current: 131, target: 140 } },
    triggers: { 'github:b': 'Rattata, tiré le 2 sept. 2026' }, ready: true, error: null,
    ...props,
  },
})
const row = (w, code) => w.find(`[data-code="${code}"]`)

describe('AchievementsView', () => {
  it('compte les succès obtenus sur le total', () => {
    expect(mountView().find('.ach-total').text()).toBe('2 / 28')
  })

  it('un succès obtenu montre son nom, sa date, son palier et qui l’a', () => {
    const r = row(mountView(), 'deja-vu')
    expect(r.find('.ach-name').text()).toBe('Déjà-vu')
    expect(r.find('.ach-date').text()).toBe('2 sept. 2026')
    expect(r.find('.ach-rarity b').text()).toBe('Rare')
    expect(r.find('.ach-rarity small').text()).toBe('4 joueurs l’ont')
  })

  it('les obtenus vont du plus récent au plus ancien', () => {
    const codes = mountView().findAll('.ach-row.is-owned').map((r) => r.attributes('data-code'))
    expect(codes).toEqual(['species-100', 'deja-vu'])
  })

  it('un succès caché non obtenu ne dit que combien l’ont', () => {
    const r = row(mountView(), 'hot-hand')
    expect(r.find('.ach-name').text()).toBe('Succès caché')
    expect(r.text()).not.toContain('Main chaude')
    expect(r.find('.ach-rarity b').exists()).toBe(false)
    expect(r.find('.ach-rarity small').text()).toBe('3 joueurs l’ont')
  })

  it('un palier en cours montre sa progression', () => {
    const r = row(mountView(), 'species-140')
    expect(r.find('.ach-hand').text()).toBe('131 / 140')
    expect(r.find('.ach-rarity small').text()).toBe('Personne encore')
  })

  it('le filtre Cachés ne garde que les succès cachés non obtenus', async () => {
    const w = mountView()
    await w.findAll('.ach-filter').find((b) => b.text().startsWith('Cachés')).trigger('click')
    expect(w.findAll('.ach-group').map((g) => g.text())).toEqual(['Cachés'])
    expect(w.findAll('.ach-row').every((r) => r.classes('is-hidden'))).toBe(true)
  })

  it('un clic sur un succès obtenu déplie ce qui l’a déclenché', async () => {
    const w = mountView()
    await row(w, 'deja-vu').trigger('click')
    expect(row(w, 'deja-vu').find('.ach-detail').text()).toBe('Débloqué le 2 sept. 2026 · Rattata, tiré le 2 sept. 2026')
  })

  it('affiche l’erreur et réessaie', async () => {
    const w = mountView({ ready: false, error: 'relation "achievements" does not exist' })
    expect(w.find('.board-error').text()).toContain('relation "achievements" does not exist')
    await w.find('.board-error button').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
  })

  it('affiche le chargement avant la première lecture', () => {
    expect(mountView({ ready: false }).find('.board-loading').exists()).toBe(true)
  })
})
