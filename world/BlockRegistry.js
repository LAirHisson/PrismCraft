/**
 * Registre centralisé des types de blocs.
 * Charge les propriétés depuis data/blocks.json et fournit une API scalable.
 */

export class BlockRegistry {
  /**
   * @param {Array} blocksJSON - Tableau des objets bloc depuis data/blocks.json
   */
  constructor(blocksJSON) {
    this.blocks = new Map(blocksJSON.map(b => [b.id, b]));
  }

  /**
   * Récupère l'objet bloc complet par ID.
   * @param {number} blockId
   * @returns {Object|undefined}
   */
  getBlock(blockId) {
    return this.blocks.get(blockId);
  }

  /**
   * Récupère le nom du bloc.
   * @param {number} blockId
   * @returns {string}
   */
  getName(blockId) {
    return this.getBlock(blockId)?.name ?? 'Unknown';
  }

  /**
   * Récupère la texture des faces latérales.
   * @param {number} blockId
   * @returns {string} ex: 'grass_side.png'
   */
  getTextureSide(blockId) {
    const b = this.getBlock(blockId);
    return b?.textureSide ?? b?.texture ?? 'stone.png';
  }

  /**
   * Récupère la texture de la calotte HAUT.
   * Défaut : la texture latérale si `top.texture` est absent.
   * @param {number} blockId
   * @returns {string}
   */
  getTopTexture(blockId) {
    return this.getBlock(blockId)?.top?.texture ?? this.getTextureSide(blockId);
  }

  /**
   * Récupère la texture de la calotte BAS.
   * Défaut : la texture latérale si `bottom.texture` est absent.
   * @param {number} blockId
   * @returns {string}
   */
  getBottomTexture(blockId) {
    return this.getBlock(blockId)?.bottom?.texture ?? this.getTextureSide(blockId);
  }

  /**
   * Mode de mapping UV de la calotte HAUT.
   * 'square'   : projection top-down (1 triangle, comme une face plate)
   * 'triangle' : système radial (3 sous-triangles, continuité entre prismes)
   * Défaut : 'square'.
   * @param {number} blockId
   * @returns {'square'|'triangle'}
   */
  getTopMapping(blockId) {
    return this.getBlock(blockId)?.top?.mapping ?? 'square';
  }

  /**
   * Mode de mapping UV de la calotte BAS.
   * @param {number} blockId
   * @returns {'square'|'triangle'}
   */
  getBottomMapping(blockId) {
    return this.getBlock(blockId)?.bottom?.mapping ?? 'square';
  }

  /**
   * Récupère la résistance du bloc (0–1+, 1.0 = normal).
   * @param {number} blockId
   * @returns {number}
   */
  getResistance(blockId) {
    return this.getBlock(blockId)?.resistance ?? 1.0;
  }

  /**
   * Vérifie si le bloc est soumis à la gravité.
   * @param {number} blockId
   * @returns {boolean}
   */
  hasGravity(blockId) {
    return this.getBlock(blockId)?.gravity ?? false;
  }

  /**
   * Récupère le temps de minage en secondes.
   * @param {number} blockId
   * @returns {number}
   */
  getMineTime(blockId) {
    return this.getBlock(blockId)?.mineTime ?? 1.0;
  }

  /**
   * Récupère le type de son du bloc (pour l'audio SFX).
   * @param {number} blockId
   * @returns {string} 'stone', 'gravel', 'grass', 'wood', etc.
   */
  getSoundType(blockId) {
    return this.getBlock(blockId)?.soundType ?? 'stone';
  }

  /**
   * Vérifie si le bloc est opaque (affecte le culling).
   * @param {number} blockId
   * @returns {boolean}
   */
  isOpaque(blockId) {
    return this.getBlock(blockId)?.opaque ?? true;
  }

  /**
   * Vérifie si le bloc a des collisions (l'eau n'en a pas).
   * @param {number} blockId
   * @returns {boolean}
   */
  isSolid(blockId) {
    return this.getBlock(blockId)?.solid ?? true;
  }

  /**
   * Mode de matériau. Source unique pour PrismMaterial.
   * 'plant' (lames alphaTest), 'cutout' (alphaTest, ex. feuilles),
   * 'blend' (semi-transparent, ex. eau), 'opaque' (défaut).
   * @param {number} blockId
   * @returns {'plant'|'cutout'|'blend'|'opaque'}
   */
  getMaterialMode(blockId) {
    const b = this.getBlock(blockId);
    if (b?.shape === 'plant') return 'plant';
    return b?.render ?? (b?.opaque === false ? 'cutout' : 'opaque');
  }

  /**
   * Forme géométrique du bloc : 'prism' (défaut) ou 'plant' (3 lames en croix).
   * @param {number} blockId
   * @returns {'prism'|'plant'}
   */
  getShape(blockId) {
    return this.getBlock(blockId)?.shape ?? 'prism';
  }

  /**
   * Id du bloc lâché au cassage. Défaut : le bloc lui-même. `null` = ne lâche rien.
   * @param {number} blockId
   * @returns {number|null}
   */
  getDrop(blockId) {
    const b = this.getBlock(blockId);
    return b && 'drop' in b ? b.drop : blockId;
  }

  /**
   * Taille max d'un stack pour ce bloc (défaut 64).
   * @param {number} blockId
   * @returns {number}
   */
  getMaxStack(blockId) {
    return this.getBlock(blockId)?.maxStack ?? 64;
  }

  /**
   * Vrai si le bloc est un liquide (eau) — utilisé pour la noyade.
   * @param {number} blockId
   * @returns {boolean}
   */
  isLiquid(blockId) {
    return this.getBlock(blockId)?.liquid ?? false;
  }

  /**
   * Taille de grille de craft ouverte au clic droit (0 = aucune, ex. 3 pour la table).
   * @param {number} blockId
   * @returns {number}
   */
  getCraftingGrid(blockId) {
    return this.getBlock(blockId)?.craftingGrid ?? 0;
  }

  /**
   * Bloc plein obtenu en doublant un slab (deux moitiés), ou null.
   * @param {number} blockId
   * @returns {number|null}
   */
  getFullBlock(blockId) {
    return this.getBlock(blockId)?.full ?? null;
  }

  /**
   * Vérifie si le bloc est inflammable.
   * @param {number} blockId
   * @returns {boolean}
   */
  isFlammable(blockId) {
    return this.getBlock(blockId)?.flammable ?? false;
  }

  /**
   * Retrouve l'id d'un bloc par son nom (insensible à la casse).
   * @param {string} name
   * @returns {number|undefined}
   */
  getIdByName(name) {
    const target = name.toLowerCase();
    for (const [id, block] of this.blocks) {
      if (block.name?.toLowerCase() === target) return id;
    }
    return undefined;
  }

  /**
   * Récupère tous les IDs de blocs.
   * @returns {number[]}
   */
  getAllBlockIds() {
    return Array.from(this.blocks.keys());
  }

  /**
   * Récupère le nombre total de types de blocs.
   * @returns {number}
   */
  getBlockCount() {
    return this.blocks.size;
  }
}

/**
 * Charge le catalogue JSON depuis data/blocks.json.
 * @returns {Promise<BlockRegistry>}
 */
export async function loadBlockRegistry() {
  const response = await fetch('data/blocks.json');
  if (!response.ok) {
    throw new Error(`Failed to load blocks.json: ${response.statusText}`);
  }
  const { blocks } = await response.json();
  return new BlockRegistry(blocks);
}
