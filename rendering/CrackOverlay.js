import * as THREE from "three";
import { TriGrid, Orientation } from "../world/TriGrid.js";
import { getPrismGeometry } from "./PrismGeometry.js";

// Overlay de fissures (stades de destruction MC) posé sur le prisme en cours de minage.
const STAGES = 10;
const PATH = "assets/textures/blocks/mining/destroy_stage_";

export class CrackOverlay {
  constructor(scene) {
    this.scene = scene;

    const loader = new THREE.TextureLoader();
    this._textures = [];
    for (let i = 0; i < STAGES; i++) {
      const t = loader.load(`${PATH}${i}.png`);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.SRGBColorSpace;
      this._textures.push(t);
    }

    const makeMat = () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        opacity: 0.5,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });

    // capMode 'flat' : calottes haut/bas en projection carrée (pas radiale) pour les fissures.
    this._meshes = {
      [Orientation.UP]: new THREE.Mesh(getPrismGeometry(Orientation.UP, "flat"), makeMat()),
      [Orientation.DOWN]: new THREE.Mesh(getPrismGeometry(Orientation.DOWN, "flat"), makeMat()),
    };
  }

  show(col, row, height, progress) {
    const stage = Math.min(STAGES - 1, Math.max(0, Math.floor(progress * STAGES)));
    const orient = TriGrid.getOrientation(col, row);
    const mesh = this._meshes[orient];
    const other = orient === Orientation.UP ? Orientation.DOWN : Orientation.UP;
    if (this._meshes[other].parent) this.scene.remove(this._meshes[other]);
    mesh.material.map = this._textures[stage];
    mesh.material.needsUpdate = true;
    mesh.position.copy(TriGrid.gridToWorld(col, row, height));
    if (!mesh.parent) this.scene.add(mesh);
  }

  hide() {
    for (const mesh of Object.values(this._meshes)) {
      if (mesh.parent) this.scene.remove(mesh);
    }
  }
}
