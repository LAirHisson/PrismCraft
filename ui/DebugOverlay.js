import * as THREE from "three";
import {
  TriGrid,
  TRIANGLE_SIDE,
  TRIANGLE_HEIGHT,
} from "../world/TriGrid.js";
import { CHUNK_SIZE } from "../world/Chunk.js";
import { i18n } from "../core/I18n.js";

const CW = CHUNK_SIZE * (TRIANGLE_SIDE / 2); // largeur monde d'un chunk (x)
const CD = CHUNK_SIZE * TRIANGLE_HEIGHT; // profondeur monde d'un chunk (z)
const BORDER_RANGE = 2; // chunks de grille autour du joueur
const Y_BOT = -5;
const Y_TOP = 90;

/**
 * Menu de debug façon F3 (touche Inser) : FPS, coordonnées, chunks affichés,
 * blocs/triangles rendus, et grille 3D des bordures de chunks.
 */
export class DebugOverlay {
  constructor(scene, worldManager, playerController, sunLight = null) {
    this.scene = scene;
    this.world = worldManager;
    this.player = playerController;
    this.sunLight = sunLight;
    this.visible = false;
    this._fps = 0;
    this._lastChunk = null;

    this._buildPanel();
    this._buildBorders();
    this._buildShadowHelper();
    this._buildPlayerBox();
    this._bindKeys();
  }

  _buildPlayerBox() {
    const r = this.player.collisionRadius;
    const h = this.player.collisionHeight;
    const ring = [];
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      ring.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    const pos = [];
    for (let k = 0; k < 6; k++) {
      const [x0, z0] = ring[k];
      const [x1, z1] = ring[(k + 1) % 6];
      pos.push(x0, 0, z0, x1, 0, z1); // anneau bas
      pos.push(x0, h, z0, x1, h, z1); // anneau haut
      pos.push(x0, 0, z0, x0, h, z0); // arête verticale
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    this._playerBox = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xff3030, depthTest: false }),
    );
    this._playerBox.renderOrder = 999;
    this._playerBox.visible = false;
    this._playerBox.frustumCulled = false;
    this.scene.add(this._playerBox);
  }

  _buildShadowHelper() {
    if (!this.sunLight || !this.sunLight.shadow) return;
    // Wireframe de la shadow camera = zone d'ombres rendue
    this._shadowHelper = new THREE.CameraHelper(this.sunLight.shadow.camera);
    this._shadowHelper.visible = false;
    this.scene.add(this._shadowHelper);
  }

  _buildPanel() {
    const el = document.createElement("pre");
    el.style.cssText = `
      position: fixed; top: 8px; left: 8px; margin: 0;
      color: #fff; font: 18px/1.4 monospace;
      text-shadow: 0 1px 2px #000; pointer-events: none;
      white-space: pre; z-index: 150; display: none;
    `;
    document.body.appendChild(el);
    this._panel = el;
  }

  _buildBorders() {
    const mat = new THREE.LineBasicMaterial({
      color: 0xffee00,
      transparent: true,
      opacity: 0.6,
      depthTest: false, // visible à travers le terrain
    });
    this._borders = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
    this._borders.renderOrder = 999;
    this._borders.visible = false;
    this._borders.frustumCulled = false;
    this.scene.add(this._borders);
  }

  _bindKeys() {
    document.addEventListener("keydown", (e) => {
      if (e.code === "Insert") this.toggle();
    });
  }

  toggle() {
    this.visible = !this.visible;
    this._panel.style.display = this.visible ? "block" : "none";
    this._borders.visible = this.visible;
    if (this._shadowHelper) this._shadowHelper.visible = this.visible;
    if (this._playerBox) this._playerBox.visible = this.visible;
    this._lastChunk = null; // force la reconstruction de la grille
  }

  _updateBorders(pcx, pcz) {
    const pos = [];
    const line = (x0, y0, z0, x1, y1, z1) => pos.push(x0, y0, z0, x1, y1, z1);

    for (let k = pcx - BORDER_RANGE; k <= pcx + BORDER_RANGE + 1; k++) {
      for (let m = pcz - BORDER_RANGE; m <= pcz + BORDER_RANGE + 1; m++) {
        const x = k * CW;
        const z = m * CD;
        // poteau vertical à chaque coin de chunk
        line(x, Y_BOT, z, x, Y_TOP, z);
        // segments horizontaux (grille au sol et au plafond)
        line(x, Y_BOT, z, x + CW, Y_BOT, z);
        line(x, Y_BOT, z, x, Y_BOT, z + CD);
        line(x, Y_TOP, z, x + CW, Y_TOP, z);
        line(x, Y_TOP, z, x, Y_TOP, z + CD);
      }
    }

    this._borders.geometry.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    this._borders.geometry = geo;
  }

  _stats() {
    let meshedChunks = 0;
    let blocks = 0;
    let triangles = 0;
    for (const ch of this.world.chunks.values()) {
      if (!ch.meshed) continue;
      meshedChunks++;
      blocks += ch.blocks.size;
      for (const e of ch.entries) triangles += e.faceMeta.length;
    }
    return { meshedChunks, blocks, triangles };
  }

  update(dt) {
    const inst = dt > 0 ? 1 / dt : 0;
    this._fps += (inst - this._fps) * 0.1; // lissage

    if (!this.visible) return;

    const p = this.player.position;
    const g = TriGrid.worldToGrid(p);
    const orient = TriGrid.getOrientation(g.col, g.row);
    const cx = Math.floor(g.col / CHUNK_SIZE);
    const cz = Math.floor(g.row / CHUNK_SIZE);

    const chunkKey = `${cx},${cz}`;
    if (chunkKey !== this._lastChunk) {
      this._updateBorders(cx, cz);
      this._lastChunk = chunkKey;
    }

    if (this._shadowHelper) this._shadowHelper.update();

    // Boîte de collision hexagonale : base = pieds (géométrie de y=0 à h)
    if (this._playerBox) {
      this._playerBox.position.set(p.x, p.y, p.z);
    }

    const s = this._stats();
    this._panel.textContent =
      `FPS: ${this._fps.toFixed(0)}\n` +
      `XYZ: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}\n` +
      `Cell: col ${g.col} row ${g.row} h ${g.height} (${orient})\n` +
      `Chunk: ${cx}, ${cz}\n` +
      `${i18n.t("debugChunksRendered")} ${s.meshedChunks}\n` +
      `${i18n.t("debugBlocksRendered")} ${s.blocks}\n` +
      `Triangles: ${s.triangles}`;
  }
}
