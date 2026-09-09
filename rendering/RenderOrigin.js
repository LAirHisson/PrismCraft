import * as THREE from "three";

/**
 * Origine flottante ("floating origin") : au-delà de quelques millions d'unités
 * (ex. l'easter egg Farlands), le `modelMatrix` GPU (float32, ~24 bits de
 * mantisse) de tout objet perd plus d'un bloc de précision sur les calculs qui
 * en dépendent directement côté shader — notamment la position monde utilisée
 * pour placer un fragment dans la shadow map. Ça reste vrai même quand les
 * sommets eux-mêmes sont locaux au chunk (cf. ChunkMesher/WorldManager), car ce
 * chemin-là (position d'ombre) recalcule la position monde sur le GPU à partir
 * du modelMatrix brut, pas de la matrice caméra-relative (déjà sûre) utilisée
 * pour le rendu normal.
 *
 * Solution : un groupe `worldRoot` recentré près du joueur. Tous ses enfants
 * gardent leur position en VRAIES coordonnées monde, inchangée — seule
 * `worldRoot.position` bouge (peu fréquent), donc rien ne saute visuellement ;
 * la composition de matrices (double précision côté CPU) annule alors le grand
 * décalage commun, et modelMatrix redevient de faible magnitude.
 *
 * La logique de jeu (collision, génération, sauvegarde) continue d'utiliser les
 * vraies coordonnées partout — seul ce qui touche au raycaster (qui teste contre
 * les meshes déjà recentrés sous worldRoot) doit convertir via toScene/toTrue.
 */
export class RenderOrigin {
  constructor(threshold = 4096) {
    this.offset = new THREE.Vector3();
    this.threshold = threshold;
  }

  /** Vraie coordonnée monde → coordonnée de scène (repère de worldRoot). */
  toScene(trueVec, out = new THREE.Vector3()) {
    return out.copy(trueVec).sub(this.offset);
  }

  /** Inverse de toScene — reconvertit un résultat de raycast en vraie coordonnée. */
  toTrue(sceneVec, out = new THREE.Vector3()) {
    return out.copy(sceneVec).add(this.offset);
  }

  /**
   * Recentre `worldRoot` sur `trueFocusPoint` (le joueur) si on s'en est trop
   * éloigné. Retourne true si un recentrage a eu lieu.
   */
  recenter(trueFocusPoint, worldRoot) {
    if (trueFocusPoint.distanceTo(this.offset) < this.threshold) return false;
    this.offset.copy(trueFocusPoint);
    worldRoot.position.copy(this.offset).negate();
    return true;
  }
}
