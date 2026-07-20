const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'

/** Pixel art gen 1, 96×96. Le rendu `pixelated` est imposé globalement par `img{}` dans styles.css. */
export const spriteUrl = (id, shiny = false) => `${BASE}/${shiny ? 'shiny/' : ''}${id}.png`
