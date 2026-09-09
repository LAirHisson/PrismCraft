// Empêche les raccourcis navigateur avec Ctrl/Cmd (Ctrl+S, Ctrl+D, Ctrl+P…) de couper
// le jeu — sauf quand on tape dans un champ texte (skin, quiz). N'affecte pas la course
// (InputManager enregistre quand même la touche).
const CTRL_BLOCKED = new Set([
  "KeyS", "KeyD", "KeyP", "KeyF", "KeyG", "KeyU", "KeyO", "KeyJ", "KeyB",
]);

export function installBrowserGuards() {
  window.addEventListener(
    "keydown",
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (CTRL_BLOCKED.has(e.code)) e.preventDefault();
    },
    { capture: true },
  );
}
