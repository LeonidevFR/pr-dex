import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useNoelBanner } from './useNoelBanner.js'

describe('useNoelBanner', () => {
  it('ne s’affiche que pendant la saison', () => {
    expect(useNoelBanner({ today: '2026-12-14' }).visible.value).toBe(false)
    expect(useNoelBanner({ today: '2026-12-15' }).visible.value).toBe(true)
    expect(useNoelBanner({ today: '2027-01-07' }).visible.value).toBe(false)
  })

  it('fermé, il ne l’est que pour la page : un nouveau chargement le remontre', () => {
    const b = useNoelBanner({ today: '2026-12-20' })
    b.dismiss()
    expect(b.visible.value).toBe(false)
    expect(useNoelBanner({ today: '2026-12-20' }).visible.value).toBe(true)
  })

  it('disparaît au premier lutin découvert : l’onglet Équipe prend le relais', () => {
    const discovered = ref(0)
    const b = useNoelBanner({ today: '2026-12-20', discovered })
    expect(b.visible.value).toBe(true)
    discovered.value = 1
    expect(b.visible.value).toBe(false)
  })
})
