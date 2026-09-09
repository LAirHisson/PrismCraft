export function createCrosshair() {
  const el = document.createElement("div");
  el.style.cssText = `
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 40px; height: 40px;
    pointer-events: none;
  `;
  el.innerHTML = `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    <line x1="10" y1="0"  x2="10" y2="8"  stroke="white" stroke-width="2"/>
    <line x1="2"  y1="14" x2="8"  y2="10" stroke="white" stroke-width="2"/>
    <line x1="12" y1="10" x2="18" y2="14" stroke="white" stroke-width="2"/>
  </svg>`;
  document.body.appendChild(el);
  return el;
}
