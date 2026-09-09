import * as THREE from "three";
import { TriGrid, Orientation } from "../world/TriGrid.js";
import { getPrismGeometry } from "./PrismGeometry.js";

const mat = () =>
  new THREE.LineBasicMaterial({
    color: 0xffffff,
    depthTest: true,
    transparent: true,
    opacity: 0.9,
  });

export class BlockHighlight {
  constructor(scene) {
    this.scene = scene;
    this._meshes = {
      [Orientation.UP]: new THREE.LineSegments(
        new THREE.EdgesGeometry(getPrismGeometry(Orientation.UP, "radial")),
        mat(),
      ),
      [Orientation.DOWN]: new THREE.LineSegments(
        new THREE.EdgesGeometry(getPrismGeometry(Orientation.DOWN, "radial")),
        mat(),
      ),
    };
  }

  show(col, row, height) {
    const orient = TriGrid.getOrientation(col, row);
    const mesh = this._meshes[orient];
    const other = orient === Orientation.UP ? Orientation.DOWN : Orientation.UP;
    if (this._meshes[other].parent) this.scene.remove(this._meshes[other]);
    mesh.position.copy(TriGrid.gridToWorld(col, row, height));
    if (!mesh.parent) this.scene.add(mesh);
  }

  hide() {
    for (const mesh of Object.values(this._meshes)) {
      if (mesh.parent) this.scene.remove(mesh);
    }
  }
}
