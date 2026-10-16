/** L'horloge du navigateur peut avancer de quelques secondes sur celle de GitHub. */
const CLOCK_SKEW_MS = 15_000

/**
 * État des captures lancées depuis un clic sur ⟳, résumé pour le front :
 * `waiting` (rien n'a encore démarré), `running`, `success` ou `failure`.
 *
 * GitHub ne garde qu'une capture en attente : celle d'un autre joueur peut remplacer la nôtre,
 * qui finit annulée. Une capture traite toutes les identités, donc n'importe laquelle des
 * captures lancées depuis le clic fait l'affaire. Une réussite l'emporte sur tout le reste.
 */
export function runStatus(runs, since) {
  const from = Date.parse(since) - CLOCK_SKEW_MS
  const recent = runs.filter((r) => Date.parse(r.created_at) >= from)
  if (recent.some((r) => r.status === 'completed' && r.conclusion === 'success')) return 'success'
  if (recent.some((r) => r.status === 'in_progress')) return 'running'
  if (recent.some((r) => r.status !== 'completed')) return 'waiting'
  if (recent.some((r) => r.conclusion === 'failure' || r.conclusion === 'timed_out')) return 'failure'
  return 'waiting'
}
