// [id, nom, palier, évolueVers, coût en bonbons]
// palier : c=commun u=peu commun r=rare l=légendaire
export const SPECIES = [
  [1, 'Bulbizarre', 'r', 2, 8], [2, 'Herbizarre', 'u', 3, 16], [3, 'Florizarre', 'r'],
  [4, 'Salamèche', 'r', 5, 8], [5, 'Reptincel', 'u', 6, 16], [6, 'Dracaufeu', 'r'],
  [7, 'Carapuce', 'r', 8, 8], [8, 'Carabaffe', 'u', 9, 16], [9, 'Tortank', 'r'],
  [10, 'Chenipan', 'c', 11, 8], [11, 'Chrysacier', 'u', 12, 16], [12, 'Papilusion', 'r'],
  [13, 'Aspicot', 'c', 14, 8], [14, 'Coconfort', 'u', 15, 16], [15, 'Dardargnan', 'r'],
  [16, 'Roucool', 'c', 17, 8], [17, 'Roucoups', 'u', 18, 16], [18, 'Roucarnage', 'r'],
  [19, 'Rattata', 'c', 20, 8], [20, 'Rattatac', 'u'],
  [21, 'Piafabec', 'c', 22, 8], [22, 'Rapasdepic', 'u'],
  [23, 'Abo', 'u', 24, 8], [24, 'Arbok', 'u'],
  [25, 'Pikachu', 'c', 26, 8], [26, 'Raichu', 'u'],
  [27, 'Sabelette', 'u', 28, 8], [28, 'Sablaireau', 'u'],
  [29, 'Nidoran ♀', 'c', 30, 8], [30, 'Nidorina', 'u', 31, 16], [31, 'Nidoqueen', 'r'],
  [32, 'Nidoran ♂', 'c', 33, 8], [33, 'Nidorino', 'u', 34, 16], [34, 'Nidoking', 'r'],
  [35, 'Mélofée', 'u', 36, 8], [36, 'Mélodelfe', 'u'],
  [37, 'Goupix', 'u', 38, 8], [38, 'Feunard', 'u'],
  [39, 'Rondoudou', 'u', 40, 8], [40, 'Grodoudou', 'u'],
  [41, 'Nosferapti', 'c', 42, 8], [42, 'Nosferalto', 'u'],
  [43, 'Mystherbe', 'c', 44, 8], [44, 'Ortide', 'u', 45, 16], [45, 'Rafflesia', 'r'],
  [46, 'Paras', 'c', 47, 8], [47, 'Parasect', 'u'],
  [48, 'Mimitoss', 'u', 49, 8], [49, 'Aéromite', 'u'],
  [50, 'Taupiqueur', 'c', 51, 8], [51, 'Triopikeur', 'u'],
  [52, 'Miaouss', 'c', 53, 8], [53, 'Persian', 'u'],
  [54, 'Psykokwak', 'c', 55, 8], [55, 'Akwakwak', 'u'],
  [56, 'Férosinge', 'u', 57, 8], [57, 'Colossinge', 'u'],
  [58, 'Caninos', 'u', 59, 8], [59, 'Arcanin', 'u'],
  [60, 'Ptitard', 'c', 61, 8], [61, 'Têtarte', 'u', 62, 16], [62, 'Tartard', 'r'],
  [63, 'Abra', 'u', 64, 8], [64, 'Kadabra', 'u', 65, 16], [65, 'Alakazam', 'r'],
  [66, 'Machoc', 'u', 67, 8], [67, 'Machopeur', 'u', 68, 16], [68, 'Mackogneur', 'r'],
  [69, 'Chétiflor', 'u', 70, 8], [70, 'Boustiflor', 'u', 71, 16], [71, 'Empiflor', 'r'],
  [72, 'Tentacool', 'c', 73, 8], [73, 'Tentacruel', 'u'],
  [74, 'Racaillou', 'c', 75, 8], [75, 'Gravalanch', 'u', 76, 16], [76, 'Grolem', 'r'],
  [77, 'Ponyta', 'u', 78, 8], [78, 'Galopa', 'u'],
  [79, 'Ramoloss', 'c', 80, 8], [80, 'Flagadoss', 'u'],
  [81, 'Magnéti', 'u', 82, 8], [82, 'Magnéton', 'u'],
  [83, 'Canarticho', 'r'],
  [84, 'Doduo', 'c', 85, 8], [85, 'Dodrio', 'u'],
  [86, 'Otaria', 'u', 87, 8], [87, 'Lamantine', 'u'],
  [88, 'Tadmorv', 'u', 89, 8], [89, 'Grotadmorv', 'u'],
  [90, 'Kokiyas', 'u', 91, 8], [91, 'Crustabri', 'u'],
  [92, 'Fantominus', 'u', 93, 8], [93, 'Spectrum', 'u', 94, 16], [94, 'Ectoplasma', 'r'],
  [95, 'Onix', 'u'],
  [96, 'Soporifik', 'u', 97, 8], [97, 'Hypnomade', 'u'],
  [98, 'Krabby', 'c', 99, 8], [99, 'Krabboss', 'u'],
  [100, 'Voltorbe', 'u', 101, 8], [101, 'Électrode', 'u'],
  [102, 'Nœunœuf', 'u', 103, 8], [103, 'Noadkoko', 'u'],
  [104, 'Osselait', 'u', 105, 8], [105, 'Ossatueur', 'u'],
  [106, 'Kicklee', 'r'], [107, 'Tygnon', 'r'], [108, 'Excelangue', 'r'],
  [109, 'Smogo', 'u', 110, 8], [110, 'Smogogo', 'u'],
  [111, 'Rhinocorne', 'u', 112, 8], [112, 'Rhinoféros', 'u'],
  [113, 'Leveinard', 'r'], [114, 'Saquedeneu', 'r'], [115, 'Kangourex', 'r'],
  [116, 'Hypotrempe', 'u', 117, 8], [117, 'Hypocéan', 'u'],
  [118, 'Poissirène', 'c', 119, 8], [119, 'Poissoroy', 'u'],
  [120, 'Stari', 'u', 121, 8], [121, 'Staross', 'u'],
  [122, 'M. Mime', 'r'], [123, 'Insécateur', 'r'], [124, 'Lippoutou', 'r'],
  [125, 'Élektek', 'r'], [126, 'Magmar', 'r'], [127, 'Scarabrute', 'r'], [128, 'Tauros', 'r'],
  [129, 'Magicarpe', 'c', 130, 40], [130, 'Léviator', 'r'],
  [131, 'Lokhlass', 'r'], [132, 'Métamorph', 'r'],
  [133, 'Évoli', 'r', [134, 135, 136], 8], [134, 'Aquali', 'r'], [135, 'Voltali', 'r'], [136, 'Pyroli', 'r'],
  [137, 'Porygon', 'r'],
  [138, 'Amonita', 'r', 139, 16], [139, 'Amonistar', 'u'],
  [140, 'Kabuto', 'r', 141, 16], [141, 'Kabutops', 'u'],
  [142, 'Ptéra', 'r'], [143, 'Ronflex', 'r'],
  [144, 'Artikodin', 'l'], [145, 'Électhor', 'l'], [146, 'Sulfura', 'l'],
  [147, 'Minidraco', 'r', 148, 8], [148, 'Draco', 'u', 149, 16], [149, 'Dracolosse', 'r'],
  [150, 'Mewtwo', 'l'], [151, 'Mew', 'l'],
]

export const DEX = {}
for (const [id, name, tier, to, cost] of SPECIES) {
  DEX[id] = { id, name, tier, to: to ?? null, cost: cost ?? null }
}

export const PARENT = {}
for (const s of Object.values(DEX)) {
  if (!s.to) continue
  for (const t of (Array.isArray(s.to) ? s.to : [s.to])) PARENT[t] = s.id
}

/** Remonte la chaîne d'évolution jusqu'à l'espèce de base. Clé des bonbons : une famille, un compteur. */
export function familyOf(id) {
  let current = id
  while (PARENT[current]) current = PARENT[current]
  return current
}

/** Vrai si la famille de `id` comporte au moins une évolution — sert à repérer les bonbons morts. */
export function hasEvoInFamily(id) {
  const fam = familyOf(id)
  return Object.values(DEX).some((s) => familyOf(s.id) === fam && s.to)
}

export const POOL = { c: [], u: [], r: [], l: [] }
for (const s of Object.values(DEX)) POOL[s.tier].push(s.id)

export const TIER_LABEL = { c: 'Commun', u: 'Peu commun', r: 'Rare', l: 'Légendaire' }
export const TIER_VAR = { c: 'var(--t-c)', u: 'var(--t-u)', r: 'var(--t-r)', l: 'var(--t-l)' }
export const CANDY_PER_CATCH = 3
