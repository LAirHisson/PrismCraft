// Constantes partagées par la génération de géométrie (PrismGeometryHelpers.js) et le
// shader de reprojection (RemapShaderChunk.js) pour le mapping "remap" (texture 16×16
// "pixels triangulaires", voir experiments/triangle-editor.js).
//
// Le calcul du pixel réel (256 cases, formule r²+k) se fait côté GPU, par pixel affiché
// (fragment shader), à partir de ces 3 coordonnées abstraites portées par les sommets —
// un seul triangle par calotte suffit (comme le mapping "square"), au lieu de générer
// 256 petits triangles côté CPU (bien plus coûteux à mesher et à rendre : c'était
// l'approche initiale, remplacée pour des raisons de performance).

export const REMAP_N = 16;
const ROW_H = Math.sqrt(3) / 2;

// "Apex" = sommet pointe (coordonnée abstraite (0,0)) ; "base gauche/droite" = les deux
// sommets de l'arête opposée. Correspondance avec les sommets réels du prisme :
// calotte HAUT → apex=C1, base gauche=A1, base droite=B1 ; calotte BAS → apex=C0,
// base gauche=A0, base droite=B0 (mêmes rôles, C étant toujours le sommet "pointe" du
// prisme quelle que soit l'orientation UP/DOWN — voir corners() dans PrismGeometryHelpers).
export const REMAP_APEX = [0, 0];
export const REMAP_BASE_L = [-REMAP_N / 2, REMAP_N * ROW_H];
export const REMAP_BASE_R = [REMAP_N / 2, REMAP_N * ROW_H];
