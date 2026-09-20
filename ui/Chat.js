const MESSAGE_LIFETIME_MS = 10000;

export class Chat {
  constructor(onCommand, onOpen, onClose) {
    this.onCommand = onCommand;
    this.onOpen = onOpen;
    this.onClose = onClose;

    //Variables pour l'historique et l'autocomplétion  
    this.commandHistory = [];
    this.historyIndex = 0;
    this.currentTyped = ""; // Sauvegarde ce qu'on écrivait avant d'utiliser les flèches
    this.availableCommands = []; // Rempli par le CommandManager
    this.lastTabSearch = null; // Faire défiler les résultats avec Tab

    // Case du chat
    this.container = document.createElement("div");
    this.container.style.cssText = `
      position: absolute; bottom: 45px; left: 10px; width: 400px;
      z-index: 100; display: flex; flex-direction: column; gap: 5px;
      pointer-events: none;
    `;

    // Historique des messages
    this.history = document.createElement("div");
    this.history.style.cssText = `
      max-height: 250px; overflow-y: auto; display: flex;
      flex-direction: column;
      color: white; text-shadow: 1px 1px 0 #000; font-size: 14px;
      scrollbar-width: thin; scrollbar-color: #8B8B8B transparent;
    `;

    // case de saisie
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.maxLength = 100;
    this.input.style.cssText = `
      width: 100%; background: rgba(0,0,0,0.5); color: white;
      border: 2px solid #555; padding: 6px; font-family: inherit;
      font-size: 14px; display: none; outline: none; pointer-events: auto;
    `;

    this.container.appendChild(this.history);
    this.container.appendChild(this.input);
    document.body.appendChild(this.container);

    // Touches
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();

      if (e.code === "Enter" || e.code === "NumpadEnter") {
        const val = this.input.value.trim();
        if (val) {
          if (val.startsWith("/")) {
            // Ajoute à l'historique
            if (this.commandHistory[this.commandHistory.length - 1] !== val) {
              this.commandHistory.push(val);
            }
            this.onCommand(val);
          } else {
            this.addMessage(`<Joueur> ${val}`);
          }
        }
        this.close();

      } else if (e.code === "Escape") {
        this.close();
      // Mettre le messge précédent ou suivant
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        if (this.commandHistory.length > 0) {
          if (this.historyIndex === this.commandHistory.length) {
            this.currentTyped = this.input.value;
          }
          if (this.historyIndex > 0) {
            this.historyIndex--;
            this.input.value = this.commandHistory[this.historyIndex];
          }
        }

      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        if (this.historyIndex < this.commandHistory.length) {
          this.historyIndex++;
          if (this.historyIndex === this.commandHistory.length) {
            this.input.value = this.currentTyped;
          } else {
            this.input.value = this.commandHistory[this.historyIndex];
          }
        }
      //l'autocomplétition
      } else if (e.code === "Tab") {
        e.preventDefault();
        this.handleAutocomplete();
      } else {
        this.lastTabSearch = null;
      }
    });

    this.input.addEventListener("keyup", (e) => e.stopPropagation());
  }

  // Liste des commandes connues
  setCommands(cmdList) {
    this.availableCommands = cmdList;
  }

  handleAutocomplete() {
    const val = this.input.value;
    if (!val.startsWith("/")) return;

    const parts = val.split(" ");
    if (parts.length === 1) { 
      // On complete le nom de la commande
      const search = parts[0].substring(1).toLowerCase();
      
      // On cherche les correspondances
      if (!this.lastTabSearch || this.lastTabSearch.search !== search) {
        const matches = this.availableCommands.filter(c => c.startsWith(search));
        if (matches.length === 0) return;
        this.lastTabSearch = { search, matches, index: 0 };
      } else {
        this.lastTabSearch.index = (this.lastTabSearch.index + 1) % this.lastTabSearch.matches.length;
      }

      // Autocomplétition
      const match = this.lastTabSearch.matches[this.lastTabSearch.index];
      this.input.value = "/" + match + (this.lastTabSearch.matches.length === 1 ? " " : "");
    }
  }

  addMessage(text, color = "white") {
    const msg = document.createElement("div");
    msg.textContent = text;
    msg.style.cssText = `
      background: rgba(0,0,0,0.5); padding: 2px 6px;
      overflow-wrap: anywhere;
    `;
    msg.style.color = color;
    this.history.appendChild(msg);
    if (this.history.children.length > 50) this.history.firstChild.remove();
    this.history.scrollTop = this.history.scrollHeight;

    // Un message expiré reste dans l'historique, seulement masqué : rouvrir le chat le
    // réaffiche. Le chat ouvert ne masque rien, d'où le report à sa fermeture.
    msg.dataset.expired = "false";
    setTimeout(() => {
      msg.dataset.expired = "true";
      if (!this.isOpen()) msg.style.display = "none";
    }, MESSAGE_LIFETIME_MS);
  }

  _showAllMessages() {
    for (const msg of this.history.children) msg.style.display = "";
    this.history.scrollTop = this.history.scrollHeight;
  }

  _hideExpiredMessages() {
    for (const msg of this.history.children) {
      if (msg.dataset.expired === "true") msg.style.display = "none";
    }
  }

  open(prefix = "") {
    this.input.style.display = "block";
    this.input.value = prefix;
    this._showAllMessages();
    this.history.style.pointerEvents = "auto"; // molette = défilement, pas changement de slot
    // Prépare l'historique
    this.historyIndex = this.commandHistory.length;
    this.currentTyped = prefix;
    this.lastTabSearch = null;
    
    setTimeout(() => this.input.focus(), 10);
    this.onOpen();
  }

  close() {
    if (!this.isOpen()) return;
    this.input.style.display = "none";
    this.input.value = "";
    this.input.blur();
    this._hideExpiredMessages();
    this.history.style.pointerEvents = "none";
    this.onClose();
  }

  isOpen() {
    return this.input.style.display === "block";
  }
}