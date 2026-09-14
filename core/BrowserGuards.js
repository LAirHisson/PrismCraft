// Empêche les raccourcis navigateur avec Ctrl/Cmd (Ctrl+S, Ctrl+D, Ctrl+P…) de couper
// le jeu — sauf quand on tape dans un champ texte (skin, quiz). N'affecte pas la course
// (InputManager enregistre quand même la touche).
const CTRL_BLOCKED = new Set([
  "KeyS", "KeyD", "KeyP", "KeyF", "KeyG", "KeyU", "KeyO", "KeyJ", "KeyB", "KeyE",
]);

function inTextField(target) {
  return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
}

export function installBrowserGuards() {
  window.addEventListener(
    "keydown",
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (inTextField(e.target)) return;
      if (CTRL_BLOCKED.has(e.code)) e.preventDefault();
    },
    { capture: true },
  );

  // Ctrl+molette = zoom navigateur : arrive tout le temps en courant (Ctrl maintenu)
  // + changement d'objet à la molette. `passive: false` est obligatoire, sinon le
  // navigateur ignore le preventDefault sur un événement de scroll.
  window.addEventListener(
    "wheel",
    (e) => {
      if ((e.ctrlKey || e.metaKey) && !inTextField(e.target)) e.preventDefault();
    },
    { capture: true, passive: false },
  );
}
