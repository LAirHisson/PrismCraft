// Exploration : "pixels triangulaires" pour la face du dessus des prismes.
//
// Concept : une texture reste stockée comme un PNG 16×16 tout à fait normal (256
// pixels), mais au lieu d'étirer ce carré sur la face triangulaire (ce qui déforme
// chaque pixel en losange/parallélogramme), on la relit comme une grille de 256
// petits triangles équilatéraux qui pavent PARFAITEMENT le grand triangle — chaque
// pixel du fichier devient un vrai pixel triangulaire, sans déformation.
//
// Subdivision (mathématiquement la seule façon de paver un triangle équilatéral avec
// des triangles équilatéraux plus petits, tous identiques) :
//   - N = 16 rangées, de l'apex (rangée 0, 1 triangle) à la base (rangée 15, 31 triangles).
//   - La rangée r contient (2r+1) triangles : (r+1) "pointe en haut" (même sens que le
//     grand triangle) alternés avec r "pointe en bas" (inversés), en commençant et
//     finissant par un triangle "pointe en haut".
//   - Total : somme(2r+1, r=0..15) = 16² = 256 — exactement le nombre de pixels d'un
//     PNG 16×16. Ce n'est pas une coïncidence, c'est pourquoi 16 est un bon choix de N.
//
// Correspondance pixel <-> triangle : le pixel (px, py) du PNG (index p = py*16+px,
// ordre de lecture normal d'une image) est assigné à la rangée r = floor(sqrt(p)) et à
// la position k = p - r² dans cette rangée (formule fermée, réversible). Cette
// correspondance n'a pas besoin d'être "intuitive" visuellement dans le fichier PNG brut
// — le futur éditeur présentera directement la vue triangulaire à l'artiste et gérera
// cette conversion en interne ; seul le stockage final est un carré normal.

export const TRI_N = 16;

/** Index séquentiel 0..255 d'un triangle (rangée r, position k dans la rangée). */
export function slotIndex(r, k) {
  return r * r + k;
}

/** Inverse : pixel-index (ordre de lecture du PNG) -> (rangée, position). */
export function rowColFromIndex(p) {
  const r = Math.floor(Math.sqrt(p));
  return { r, k: p - r * r };
}

/**
 * Sommet (row, col) de la grille de points sous-jacente (row: 0..N, col: 0..row),
 * en coordonnées "unité" (arête du plus petit triangle = 1), apex en (0,0).
 */
function gridPoint(row, col) {
  return { x: col - row / 2, y: row * (Math.sqrt(3) / 2) };
}

/**
 * Sommets (3 points, coordonnées unité) du triangle à la rangée r, position k.
 * k pair -> "pointe en haut" (j = k/2) ; k impair -> "pointe en bas" (j = (k-1)/2).
 */
export function triangleUnitVerts(r, k) {
  const up = k % 2 === 0;
  const j = up ? k / 2 : (k - 1) / 2;
  if (up) {
    return [gridPoint(r, j), gridPoint(r + 1, j), gridPoint(r + 1, j + 1)];
  }
  return [gridPoint(r, j), gridPoint(r, j + 1), gridPoint(r + 1, j + 1)];
}

/** Convertit des sommets en coordonnées unité vers l'espace canvas (origin = apex, échelle s). */
function toCanvas(verts, origin, s) {
  return verts.map((v) => ({ x: origin.x + v.x * s, y: origin.y + v.y * s }));
}

// ─────────────── Texture source de test (16×16, générée) ───────────────

/** Motif dégradé + repères de coin, pour vérifier visuellement qu'aucune rotation/
 *  symétrie ne s'est glissée dans le mapping (chaque coin a une couleur distincte). */
export function makeSourceCanvas() {
  const c = document.createElement("canvas");
  c.width = TRI_N;
  c.height = TRI_N;
  const ctx = c.getContext("2d");
  for (let py = 0; py < TRI_N; py++) {
    for (let px = 0; px < TRI_N; px++) {
      const hue = (px / (TRI_N - 1)) * 300;
      const light = 25 + (py / (TRI_N - 1)) * 55;
      ctx.fillStyle = `hsl(${hue}, 80%, ${light}%)`;
      ctx.fillRect(px, py, 1, 1);
    }
  }
  // Repères de coin : (0,0) rouge, (15,0) vert, (0,15) bleu, (15,15) blanc.
  ctx.fillStyle = "#ff0000"; ctx.fillRect(0, 0, 2, 2);
  ctx.fillStyle = "#00ff00"; ctx.fillRect(TRI_N - 2, 0, 2, 2);
  ctx.fillStyle = "#0000ff"; ctx.fillRect(0, TRI_N - 2, 2, 2);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(TRI_N - 2, TRI_N - 2, 2, 2);
  return c;
}

// ─────────────── Rendu 1 : aperçu brut du PNG source (agrandi, nearest-neighbor) ───────────────

export function drawSourcePreview(ctx, srcCanvas, size) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(srcCanvas, 0, 0, TRI_N, TRI_N, 0, 0, size, size);
}

// ─────────────── Rendu 2 : méthode actuelle (étirement carré -> triangle) ───────────────

/** Mappe le triangle source (0,0)-(N,0)-(0,N) du PNG sur le grand triangle rendu, par
 *  transformation affine (canvas 2D) — c'est ce qui déforme les pixels carrés en losanges. */
export function drawNaiveStretch(ctx, srcCanvas, origin, s) {
  const A = { x: origin.x, y: origin.y };                    // apex     <- (0,0)
  const BR = { x: origin.x + (TRI_N / 2) * s, y: origin.y + TRI_N * (Math.sqrt(3) / 2) * s }; // <- (N,0)
  const BL = { x: origin.x - (TRI_N / 2) * s, y: origin.y + TRI_N * (Math.sqrt(3) / 2) * s }; // <- (0,N)

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(A.x, A.y);
  ctx.lineTo(BR.x, BR.y);
  ctx.lineTo(BL.x, BL.y);
  ctx.closePath();
  ctx.clip();

  const e = A.x, f = A.y;
  const a = (BR.x - e) / TRI_N, b = (BR.y - f) / TRI_N;
  const c = (BL.x - e) / TRI_N, d = (BL.y - f) / TRI_N;
  ctx.setTransform(a, b, c, d, e, f);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(srcCanvas, 0, 0);
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ─────────────── Rendu 3 : la nouvelle méthode (256 pixels triangulaires) ───────────────

export function drawTriangularMosaic(ctx, srcCanvas, origin, s, { wireframe = false } = {}) {
  const srcCtx = srcCanvas.getContext("2d");
  const img = srcCtx.getImageData(0, 0, TRI_N, TRI_N).data;

  for (let p = 0; p < TRI_N * TRI_N; p++) {
    const { r, k } = rowColFromIndex(p);
    const px = p % TRI_N;
    const py = Math.floor(p / TRI_N);
    const i = (py * TRI_N + px) * 4;

    const verts = toCanvas(triangleUnitVerts(r, k), origin, s);
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    ctx.lineTo(verts[1].x, verts[1].y);
    ctx.lineTo(verts[2].x, verts[2].y);
    ctx.closePath();

    if (wireframe) {
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgb(${img[i]}, ${img[i + 1]}, ${img[i + 2]})`;
      ctx.fill();
    }
  }
}

// ─────────────── Chargement d'un fichier image choisi par l'utilisateur ───────────────

/** Dessine une image chargée (n'importe quelle taille) dans un canvas TRI_N×TRI_N,
 *  redimensionnée en nearest-neighbor (pas de lissage — on veut du pixel art net). */
function imageToSourceCanvas(img) {
  const c = document.createElement("canvas");
  c.width = TRI_N;
  c.height = TRI_N;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, TRI_N, TRI_N);
  return c;
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ─────────────── Assemblage ───────────────

function setupCanvas(id, size) {
  const el = document.getElementById(id);
  el.width = size;
  el.height = size;
  return el.getContext("2d");
}

function renderAll(src, sourceLabel) {
  const SIZE = 380;
  const MARGIN = 20;
  // Échelle (arête du plus petit triangle) telle que la hauteur totale tienne dans le canvas.
  const scale = (SIZE - MARGIN) / (TRI_N * (Math.sqrt(3) / 2));
  const origin = { x: SIZE / 2, y: MARGIN / 2 };

  drawSourcePreview(setupCanvas("c-source", 160), src, 160);

  const ctxNaive = setupCanvas("c-naive", SIZE);
  drawNaiveStretch(ctxNaive, src, origin, scale);

  const ctxTri = setupCanvas("c-tri", SIZE);
  drawTriangularMosaic(ctxTri, src, origin, scale);

  const ctxWire = setupCanvas("c-wire", SIZE);
  drawTriangularMosaic(ctxWire, src, origin, scale, { wireframe: true });

  document.getElementById("info").textContent =
    `N = ${TRI_N} rangées, ${TRI_N * TRI_N} triangles (= ${TRI_N}×${TRI_N} pixels). ` +
    `Source : ${sourceLabel}.`;
}

function setupFileInput() {
  const input = document.getElementById("c-file");
  if (!input) return;
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const img = await loadImageFile(file);
      renderAll(imageToSourceCanvas(img), `${file.name} (redimensionné en ${TRI_N}×${TRI_N})`);
    } catch (err) {
      console.error("Chargement de l'image échoué", err);
      document.getElementById("info").textContent = "Échec du chargement de l'image.";
    }
  });
}

// Auto-run seulement sur sa propre page (triangle-texture-test.html) — ce module est
// aussi importé par experiments/triangle-editor.js pour ses fonctions pures
// (TRI_N, slotIndex, rowColFromIndex, triangleUnitVerts), qui n'a pas ces éléments DOM.
if (document.getElementById("c-source")) {
  renderAll(makeSourceCanvas(), "dégradé généré");
  setupFileInput();
}
