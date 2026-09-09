// Injecte dans un MeshStandardMaterial (via onBeforeCompile) le calcul du mapping
// "remap" — reprojection, PAR FRAGMENT (pixel réellement affiché), de la coordonnée
// abstraite portée par l'attribut `remapUv` vers le bon texel de la texture 16×16
// "pixels triangulaires" (formule r²+k, voir experiments/triangle-editor.js et
// rendering/TriPixelGrid.js). Un seul triangle de géométrie par calotte suffit — le
// calcul de la grille de 256 cases est fait par le GPU, pas par 256 triangles réels.
import { REMAP_N } from "./TriPixelGrid.js";

const ROW_H = Math.sqrt(3) / 2;

export function applyRemapShader(material) {
  const prevOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prevOnBeforeCompile?.(shader, renderer);

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "attribute vec2 remapUv;\nvarying vec2 vRemapUv;\n#include <common>",
      )
      .replace(
        "#include <begin_vertex>",
        "vRemapUv = remapUv;\n#include <begin_vertex>",
      );

    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "varying vec2 vRemapUv;\n#include <common>")
      .replace(
        "#include <map_fragment>",
        `
        #ifdef USE_MAP
        {
          const float N = ${REMAP_N.toFixed(1)};
          const float ROW_H = ${ROW_H};
          float b = vRemapUv.y / ROW_H;
          float r = clamp(floor(b), 0.0, N - 1.0);
          float a = vRemapUv.x + b * 0.5;
          float j = floor(a);
          float fracA = a - j;
          float fracB = b - r;
          bool isUp = fracA <= fracB;
          j = clamp(j, 0.0, isUp ? r : max(r - 1.0, 0.0));
          float k = isUp ? (2.0 * j) : (2.0 * j + 1.0);
          float p = clamp(r * r + k, 0.0, N * N - 1.0);
          float px = mod(p, N);
          float py = floor(p / N);
          // texture.flipY (par défaut en three.js) place v=0 en BAS de l'image, pas en
          // haut — py=0 (première rangée du PNG, ordre de lecture normal) doit donc
          // viser v proche de 1, pas 0.
          vec2 remappedUv = vec2(px + 0.5, N - py - 0.5) / N;
          vec4 sampledDiffuseColor = texture2D( map, remappedUv );
          diffuseColor *= sampledDiffuseColor;
        }
        #endif
        `,
      );
  };
  // Empêche three.js de partager un programme compilé avec un matériau "normal" par
  // ailleurs identique — onBeforeCompile seul n'est pas toujours pris en compte dans
  // la clé de cache interne.
  material.customProgramCacheKey = () => "remap";
}
