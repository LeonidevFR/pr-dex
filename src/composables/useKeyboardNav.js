import { onMounted, onUnmounted } from 'vue'

const INTERACTIVE = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'])

const isInteractive = (el) => Boolean(el) && (INTERACTIVE.has(el.tagName) || el.hasAttribute('tabindex'))

/**
 * Raccourcis clavier globaux, volontairement réduits à ce qu'aucun overlay ne peut prendre
 * en charge lui-même. La chaîne « Espace pour enchaîner » repose d'abord sur le focus : chaque
 * overlay focalise son bouton principal et le navigateur fait le reste. Un routeur clavier
 * complet devrait sinon dupliquer l'état interne des overlays (l'étape du rituel, notamment),
 * et les deux copies divergeraient.
 *
 * @param {import('vue').Ref<boolean>} blocked — un overlay est ouvert : Espace lui appartient
 * @param {() => void} onSpace  — action principale de la home
 * @param {() => void} onEscape — fermeture de l'overlay du dessus
 */
export function useKeyboardNav({ blocked, onSpace, onEscape }) {
  function handle(e) {
    if (e.key === 'Escape') { onEscape(); return }
    if (e.key !== ' ') return
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

    // Overlay ouvert : si son bouton principal a le focus, il faut laisser Espace
    // l'activer nativement — c'est tout le mécanisme de la chaîne « Espace pour
    // enchaîner ». Rien d'interactif focalisé (étape « silhouette » du rituel, qui ne
    // focalise volontairement rien) : aucune activation n'est possible, on absorbe
    // seulement pour empêcher la page de défiler derrière l'overlay.
    if (blocked.value) {
      if (!isInteractive(document.activeElement)) e.preventDefault()
      return
    }

    // Le focus prime : Espace sur un bouton doit activer ce bouton, pas ouvrir le deck.
    if (isInteractive(document.activeElement)) return

    e.preventDefault()
    onSpace()
  }

  onMounted(() => window.addEventListener('keydown', handle))
  onUnmounted(() => window.removeEventListener('keydown', handle))
}
