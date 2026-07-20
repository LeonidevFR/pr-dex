import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectScreen from './ConnectScreen.vue'

const mountConnect = (props = {}) => mount(ConnectScreen, { props })

describe('ConnectScreen', () => {
  it('ne contient aucun raccourci de maquette', () => {
    const w = mountConnect()
    expect(w.find('.sim').exists()).toBe(false)
    expect(w.text()).not.toContain('Aperçu maquette')
  })

  it('émet connect au clic, sans payload à saisir', async () => {
    const w = mountConnect()
    await w.find('.btn-solid').trigger('click')
    expect(w.emitted('connect')).toBeTruthy()
  })

  it.each([
    ['offline', 'Pas de réseau'],
    ['server', 'Service indisponible'],
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
