/**
 * Identifiant d'un exemplaire précis, unique toutes sources confondues — c'est lui que
 * `state.claimed` et `state.evolutions[].fromKey` référencent.
 *
 * Le préfixe de source n'est pas décoratif : deux sources numérotent leurs événements
 * indépendamment (l'identifiant « 42 » existe partout), donc sans lui un feedback et une
 * PR pourraient désigner le même exemplaire et se réclamer l'un l'autre.
 *
 * Sert aussi de seed au tirage. Les deux notions peuvent diverger plus tard sans rien
 * casser : `species` et `shiny` sont stockés à la capture, jamais recalculés à l'affichage.
 */
export const entryKey = (source, externalId) => `${source}:${externalId}`
