import { ref, computed } from 'vue'
import { noelStarted } from '../../shared/noel.js'

/** La clé du booster du 25 décembre, `noel:<saison>` — les autres portent la clé d'une capture. */
export const isGift = (key) => /^noel:\d{4}$/.test(key)

/**
 * Les cartes équipe, à part de la collection : rien ici ne touche `useCollection`, donc ni le
 * Pokédex, ni le classement, ni les succès. Un client sans `readTeam`, ou une lecture en échec
 * (table pas encore créée), laisse simplement l'easter egg invisible. Avant le début de la
 * première saison, rien n'est lu du tout ; `force` lève cette garde (la démo).
 */
export function useTeamCards() {
  const members = ref([])
  const cards = ref([])
  let client = null

  async function load(c, { today = new Date().toISOString().slice(0, 10), force = false } = {}) {
    client = c
    if (!c?.readTeam || (!force && !noelStarted(today))) return
    try {
      const data = await c.readTeam()
      members.value = data.members
      cards.value = data.cards
    } catch (e) {
      console.warn('Cartes équipe indisponibles :', e.message)
    }
  }

  const byId = computed(() => Object.fromEntries(members.value.map((m) => [m.id, m])))
  // Une carte dont le membre a disparu de la table ne s'affiche pas : elle n'aurait ni nom ni photo.
  const shown = computed(() => cards.value.filter((c) => byId.value[c.member]))
  const pending = computed(() => shown.value.filter((c) => !c.opened_at))
  const gift = computed(() => pending.value.find((c) => isGift(c.key)) ?? null)
  const owned = computed(() => {
    const map = {}
    for (const c of shown.value) if (c.opened_at) (map[c.member] ??= []).push(c)
    return map
  })

  const discovered = computed(() => members.value.filter((m) => owned.value[m.id]).length)

  /** Ouverte tout de suite à l'écran ; une écriture en échec la remet en attente. */
  async function open(key) {
    const card = cards.value.find((c) => c.key === key)
    if (!card || card.opened_at) return
    card.opened_at = new Date().toISOString()
    try {
      await client.openTeamCard(key)
    } catch (e) {
      card.opened_at = null
      console.warn('Carte équipe non enregistrée :', e.message)
    }
  }

  return { members, cards: shown, byId, pending, gift, owned, discovered, load, open }
}
