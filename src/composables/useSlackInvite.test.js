import { describe, it, expect } from 'vitest'
import { useSlackInvite } from './useSlackInvite.js'

const memory = () => {
  const data = {}
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v) } }
}

describe('useSlackInvite', () => {
  it('n’est pas fermé au départ', () => {
    expect(useSlackInvite({ storage: memory() }).dismissed.value).toBe(false)
  })
  it('se souvient qu’on l’a fermé', () => {
    const storage = memory()
    useSlackInvite({ storage }).dismiss()
    expect(useSlackInvite({ storage }).dismissed.value).toBe(true)
  })
  it('se ferme pour la session si le stockage jette', () => {
    const broken = { getItem: () => { throw new Error('bloqué') }, setItem: () => { throw new Error('bloqué') } }
    const invite = useSlackInvite({ storage: broken })
    invite.dismiss()
    expect(invite.dismissed.value).toBe(true)
  })
})
