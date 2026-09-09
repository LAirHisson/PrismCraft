// Menu pause : boutons triangulaires alternés (outline des cases d'inventaire) + skin + paramètres.

import { createBorderPoly } from "./triSlot.js";
import { i18n } from "../core/I18n.js";

const BTN_W = 340;
const BTN_H = 74;
const BTN_THICK = 10;

function triButton(label, up, onClick) {
  const points = up
    ? [[BTN_W, 0], [0, BTN_H / 2], [BTN_W, BTN_H]] // pointe à gauche
    : [[0, 0], [BTN_W, BTN_H / 2], [0, BTN_H]]; // pointe à droite

  const wrap = document.createElement("div");
  wrap.style.cssText = `
    position: relative; width: ${BTN_W}px; height: ${BTN_H}px;
    cursor: pointer; pointer-events: auto;
  `;

  const tri = document.createElement("div");
  tri.style.cssText = `
    position: absolute; inset: 0;
    clip-path: ${up ? "polygon(100% 0,0 50%,100% 100%)" : "polygon(0 0,100% 50%,0% 100%)"};
    background: #8B8B8B; transition: filter 0.1s;
  `;
  wrap.onmouseenter = () => (tri.style.filter = "brightness(1.15)");
  wrap.onmouseleave = () => (tri.style.filter = "");

  const t = document.createElement("span");
  t.textContent = label;
  t.style.cssText = `
    position: absolute; top: 0; height: 100%;
    ${up ? "right: 28px" : "left: 28px"};
    max-width: ${BTN_W - 60}px;
    display: flex; align-items: center;
    color: #fff; font-weight: bold; font-size: 18px;
    text-shadow: 0 2px 3px #000; pointer-events: none;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  `;

  wrap.append(tri, createBorderPoly(points, BTN_W, BTN_H, BTN_THICK), t);
  wrap.addEventListener("click", onClick);
  return wrap;
}

function slider(cfg) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "width: 100%; margin: 8px 0;";
  const head = document.createElement("div");
  head.style.cssText =
    "display: flex; justify-content: space-between; color: #222; font-size: 15px; font-weight: bold;";
  const name = document.createElement("span");
  name.textContent = i18n.t(cfg.labelKey);
  const val = document.createElement("span");
  val.textContent = cfg.value;
  head.append(name, val);

  const input = document.createElement("input");
  input.type = "range";
  input.min = cfg.min;
  input.max = cfg.max;
  input.step = cfg.step;
  input.value = cfg.value;
  input.style.width = "100%";
  input.addEventListener("input", () => {
    const v = Number(input.value);
    val.textContent = v;
    cfg.onChange(v);
  });
  input.addEventListener("keydown", (e) => e.stopPropagation());

  // Resynchronise l'affichage (poignée + valeur) sans redéclencher onChange — utilisé
  // quand la valeur change hors du slider (ex. import d'une sauvegarde).
  wrap._setValue = (v) => {
    input.value = v;
    val.textContent = v;
  };
  wrap._refreshLabel = () => {
    name.textContent = i18n.t(cfg.labelKey);
  };

  wrap.append(head, input);
  return wrap;
}

export class Menu {
  constructor({
    onResume, onLoadSkin, onToggleMode, onExportSave, onImportSave, onNewGame,
    modeLabel = "", settings = {},
  }) {
    this.onResume = onResume;
    this.onLoadSkin = onLoadSkin;
    this.onToggleMode = onToggleMode;
    this.onExportSave = onExportSave;
    this.onImportSave = onImportSave;
    this.onNewGame = onNewGame;
    this.settings = settings;
    this._open = false;
    this._skinFileName = null; // nom du fichier choisi — ne doit pas être écrasé par une retraduction
    this._build();
    this.setModeLabel(modeLabel);
    i18n.onChange(() => this._applyTranslations());
  }

  _panelStyle() {
    return `
      background: #C6C6C6; padding: 24px; border: 4px solid #555;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      width: ${BTN_W + 48}px; font-family: inherit;
    `;
  }

  _title(text) {
    const t = document.createElement("div");
    t.textContent = text;
    t.style.cssText =
      "font-size: 24px; font-weight: bold; color: #333; margin-bottom: 8px;";
    return t;
  }

  _build() {
    const backdrop = document.createElement("div");
    backdrop.style.cssText = `
      position: fixed; inset: 0; display: none;
      align-items: center; justify-content: center;
      background: rgba(0,0,0,0.6); z-index: 250;
    `;

    // ── Vue principale ──
    const main = document.createElement("div");
    main.style.cssText = this._panelStyle();

    const skinRow = document.createElement("div");
    skinRow.style.cssText =
      "display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%;";

    // Input natif masqué (indispensable au fonctionnement) déclenché par le triangle.
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/png";
    fileInput.style.cssText = "position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none;";
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) this._loadFile(file);
    });
    this._fileInput = fileInput;

    this._skinBtn = triButton(i18n.t("skinUpload"), true, () => fileInput.click());

    const status = document.createElement("div");
    status.style.cssText = "font-size: 13px; color: #444; min-height: 16px;";
    this._status = status;
    skinRow.append(this._skinBtn, fileInput, status);

    // Boutons triangulaires alternés (gauche / droite / gauche / droite…)
    this._modeBtn = triButton(i18n.t("mode"), false, () => this.onToggleMode?.());
    this._settingsBtn = triButton(i18n.t("settings"), true, () => this._show("settings"));
    this._resumeBtn = triButton(i18n.t("resume"), false, () => this.onResume?.());
    main.append(this._title("PrismCraft"), skinRow, this._modeBtn, this._settingsBtn, this._resumeBtn);

    // ── Vue paramètres ──
    const settings = document.createElement("div");
    settings.style.cssText = this._panelStyle();
    this._settingsTitle = this._title(i18n.t("settings"));
    settings.append(this._settingsTitle);
    this._sliders = {};
    for (const key in this.settings) {
      const s = slider(this.settings[key]);
      this._sliders[key] = s;
      settings.append(s);
    }

    // Input natif masqué pour l'import de sauvegarde — même principe que le skin.
    const saveFileInput = document.createElement("input");
    saveFileInput.type = "file";
    saveFileInput.accept = "application/json";
    saveFileInput.style.cssText = "position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none;";
    saveFileInput.addEventListener("change", () => {
      const file = saveFileInput.files?.[0];
      if (file) this.onImportSave?.(file);
      saveFileInput.value = ""; // permet de réimporter le même fichier deux fois de suite
    });

    this._exportBtn = triButton(i18n.t("exportSave"), true, () => this.onExportSave?.());
    this._importBtn = triButton(i18n.t("importSave"), false, () => saveFileInput.click());
    this._newGameBtn = triButton(i18n.t("newGame"), true, () => this.onNewGame?.());
    this._langBtn = triButton(i18n.lang.toUpperCase(), false, () => i18n.toggle());
    this._backBtn = triButton(i18n.t("back"), true, () => this._show("main"));
    settings.append(
      this._exportBtn,
      this._importBtn,
      saveFileInput,
      this._newGameBtn,
      this._langBtn,
      this._backBtn,
    );

    main.style.display = "flex";
    settings.style.display = "none";
    this._views = { main, settings };

    backdrop.append(main, settings);
    document.body.appendChild(backdrop);
    this._backdrop = backdrop;
  }

  _show(view) {
    for (const k in this._views) {
      this._views[k].style.display = k === view ? "flex" : "none";
    }
  }

  _loadFile(file) {
    this._skinFileName = file.name;
    const span = this._skinBtn?.querySelector("span");
    if (span) span.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      this.setStatus(i18n.t("loading"));
      this.onLoadSkin?.(reader.result);
    };
    reader.onerror = () => this.setStatus(i18n.t("fileReadError"));
    reader.readAsDataURL(file);
  }

  setStatus(msg) {
    this._status.textContent = msg;
  }

  // Resynchronise l'affichage des sliders (ex. après un import de sauvegarde) sans
  // redéclencher leur onChange. `values` : { [key]: number }.
  refreshSettings(values) {
    for (const key in values) this._sliders?.[key]?._setValue(values[key]);
  }

  setModeLabel(label) {
    const span = this._modeBtn?.querySelector("span");
    if (span) span.textContent = label;
  }

  // Réapplique les libellés statiques dans la langue courante — appelé une fois au
  // départ et à chaque changement de langue (i18n.onChange). Ne touche pas au nom de
  // fichier du skin déjà choisi, ni au libellé du mode (géré côté appelant via modeLabel()).
  _applyTranslations() {
    const setLabel = (btn, text) => {
      const span = btn?.querySelector("span");
      if (span) span.textContent = text;
    };
    setLabel(this._skinBtn, this._skinFileName ?? i18n.t("skinUpload"));
    setLabel(this._settingsBtn, i18n.t("settings"));
    setLabel(this._resumeBtn, i18n.t("resume"));
    setLabel(this._exportBtn, i18n.t("exportSave"));
    setLabel(this._importBtn, i18n.t("importSave"));
    setLabel(this._newGameBtn, i18n.t("newGame"));
    setLabel(this._backBtn, i18n.t("back"));
    setLabel(this._langBtn, i18n.lang.toUpperCase());
    if (this._settingsTitle) this._settingsTitle.textContent = i18n.t("settings");
    for (const key in this._sliders) this._sliders[key]._refreshLabel();
  }

  open() {
    this._open = true;
    this._show("main");
    this._backdrop.style.display = "flex";
  }
  close() {
    this._open = false;
    this._backdrop.style.display = "none";
  }
  isOpen() {
    return this._open;
  }
}
