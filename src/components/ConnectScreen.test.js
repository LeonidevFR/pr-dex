import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectScreen from './ConnectScreen.vue'

const mountConnect = (props = {}) => mount(ConnectScreen, { props })

describe('ConnectScreen', () => {
  it('explique comment fabriquer le jeton et avec quelles permissions', () => {
    const t = mountConnect().text()
    expect(t).toContain('Fine-grained tokens')
    expect(t).toContain('Contents')
    expect(t).toContain('Read and write')
    expect(t).toContain('No expiration')
  })

  it('ne contient aucun raccourci de maquette', () => {
    const w = mountConnect()
    expect(w.find('.sim').exists()).toBe(false)
    expect(w.text()).not.toContain('Aperçu maquette')
  })

  it('masque la saisie du jeton', () => {
    expect(mountConnect().find('#tok').attributes('type')).toBe('password')
  })

  it('pré-remplit le repo connu', () => {
    expect(mountConnect({ initialRepo: 'moi/data' }).find('#rp').element.value).toBe('moi/data')
  })

  it('émet le couple saisi, sans espaces parasites', async () => {
    const w = mountConnect()
    await w.find('#tok').setValue('  github_pat_x  ')
    await w.find('#rp').setValue(' moi/data ')
    await w.find('.btn-solid').trigger('click')
    expect(w.emitted('connect')[0]).toEqual([{ token: 'github_pat_x', repo: 'moi/data' }])
  })

  it('soumet à la touche entrée', async () => {
    const w = mountConnect()
    await w.find('#tok').setValue('github_pat_x')
    await w.find('#tok').trigger('keyup.enter')
    expect(w.emitted('connect')).toBeTruthy()
  })

  it.each([
    ['invalid', 'Jeton invalide'],
    ['revoked', 'Jeton révoqué'],
    ['notfound', 'Repo introuvable'],
    ['offline', 'Pas de réseau'],
    ['server', 'GitHub est indisponible'],
  ])('donne un diagnostic distinct pour « %s »', (kind, expected) => {
    expect(mountConnect({ error: kind }).find('.banner.err').text()).toContain(expected)
  })

  it('n’affiche aucun bandeau sans erreur', () => {
    expect(mountConnect().find('.banner').exists()).toBe(false)
  })

  it('désactive le bouton pendant la connexion', () => {
    const w = mountConnect({ busy: true })
    expect(w.find('.btn-solid').attributes('disabled')).toBeDefined()
    expect(w.find('.btn-solid').text()).toBe('Connexion…')
  })
})
