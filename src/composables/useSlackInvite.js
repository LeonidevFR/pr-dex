import { ref } from 'vue'

const KEY = 'prdex.slack-invite'

// Le stockage peut manquer ou jeter (navigation privée, données bloquées) : le bandeau se
// ferme alors pour la session, sans s'en souvenir.
const read = (storage) => { try { return storage?.getItem(KEY) } catch { return null } }
const write = (storage, v) => { try { storage?.setItem(KEY, v) } catch { /* rien à faire */ } }

/** Fermer le bandeau d'invitation est définitif : on ne le remontre plus sur ce navigateur. */
export function useSlackInvite({ storage = globalThis.localStorage } = {}) {
  const dismissed = ref(read(storage) === 'dismissed')
  function dismiss() {
    dismissed.value = true
    write(storage, 'dismissed')
  }
  return { dismissed, dismiss }
}
