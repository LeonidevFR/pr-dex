import { access } from 'node:fs/promises'

/**
 * Garde-fou : ce dépôt ne doit JAMAIS être lié au projet Supabase de production.
 *
 * La base en service porte plusieurs semaines de captures réelles, et elle ne connaît pas la
 * table de suivi des migrations de la CLI. Un `supabase db push` sur un projet lié tenterait
 * donc de rejouer le schéma entier par-dessus des données existantes. La production garde son
 * mode de déploiement d'origine — on colle le SQL dans l'éditeur du dashboard, une fois, à la
 * main ; la CLI ne sert qu'à fabriquer une base de test jetable en local.
 *
 * `supabase link` écrit `supabase/.temp/project-ref`. Sa seule présence suffit à faire échouer
 * les commandes locales, avec le message qui explique pourquoi.
 */
const REF = new URL('../supabase/.temp/project-ref', import.meta.url)

try {
  await access(REF)
} catch {
  process.exit(0)
}

console.error(`
Ce dépôt est lié à un projet Supabase distant, ce qui ne devrait jamais arriver.

La base de production porte les collections réelles de l'équipe et ignore le suivi de
migrations de la CLI : un « supabase db push » y rejouerait le schéma entier par-dessus des
données existantes.

Pour repartir sur de bonnes bases : supprimer supabase/.temp/, et déployer sur la production
en collant le SQL dans l'éditeur du dashboard, comme depuis le premier jour.
`.trim())
process.exit(1)
