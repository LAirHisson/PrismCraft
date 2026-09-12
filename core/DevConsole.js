// Commandes de debug (console navigateur, F12) : cmd("/tp x y z") téléporte le
// joueur, cmd("/clear") vide l'inventaire — une vraie ligne "/tp x y z" n'est pas
// du JS valide, d'où l'appel.
export function installDevConsole(playerController, inventory) {
  window.cmd = (input) => {
    const [name, ...args] = String(input).trim().replace(/^\//, "").split(/\s+/);
    if (name === "tp") {
      const [x, y, z] = args.map(Number);
      if (args.length !== 3 || [x, y, z].some(Number.isNaN)) {
        console.warn("Usage : cmd(\"/tp x y z\")");
        return;
      }
      playerController.teleport(x, y, z);
      console.log(`Téléporté à (${x}, ${y}, ${z})`);
    } else if (name === "clear") {
      inventory.reset();
      console.log("Inventaire vidé.");
    } else {
      console.warn(`Commande inconnue : ${name}`);
    }
  };
}
