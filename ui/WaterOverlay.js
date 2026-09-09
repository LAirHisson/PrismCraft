// Overlay plein écran (texture d'eau teintée) affiché quand la tête est sous l'eau.
export function createWaterOverlay() {
  const el = document.createElement("div");
  el.style.cssText = `
    position: fixed; inset: 0;
    display: none;
    background:
      linear-gradient(rgba(30,80,160,0.35), rgba(30,80,160,0.35)),
      url("assets/textures/blocks/water.png") center / 350px repeat;
    image-rendering: pixelated;
    opacity: 0.6;
    pointer-events: none;
    z-index: 90;
  `;
  document.body.appendChild(el);
  return {
    setVisible(v) {
      el.style.display = v ? "block" : "none";
    },
  };
}