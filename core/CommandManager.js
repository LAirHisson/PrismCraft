import { TriGrid } from '../world/TriGrid.js';

// Pour gérer les ~ et les nombres classiques
function parseCoord(input, relativeBase) {
  if (input === "~") return relativeBase;
  if (input.startsWith("~")) {
    const offset = parseFloat(input.substring(1));
    if (isNaN(offset)) throw new Error(`Coordonnée relative invalide : ${input}`);
    return relativeBase + offset;
  }
  const val = parseFloat(input);
  if (isNaN(val)) throw new Error(`Coordonnée invalide : ${input}`);
  return val;
}

export class CommandManager {
  /**
   * @param {import('../ui/Chat.js').Chat} chat 
   * @param {Object} systems 
   */
  constructor(chat, systems) {
    this.chat = chat;
    this.systems = systems;
    this.commands = new Map();
    this._registerDefaultCommands();
    this.chat.setCommands(Array.from(this.commands.keys()));
  }

  /**
   * Permet d'ajouter facilement une nouvelle commande
   */
  register(name, options) {
    this.commands.set(name.toLowerCase(), options);
  }

  /**
   * Analyse et exécute la commande tapée dans le chat
   */
  /**
   * Analyse et exécute les commandes tapées dans le chat
   */
  execute(rawInput) {
    // On sépare la chaîne par des points-virgules pour permettre d'enchaîner (ex: /tp 0 0 0; /gm 1)
    const commandStrings = rawInput.split(';');

    for (let cmdString of commandStrings) {
      cmdString = cmdString.trim();
      
      // Si la chaîne est vide (par exemple si on a mis un ";" à la toute fin), on l'ignore
      if (!cmdString) continue;

      // On enlève le '/' éventuel au début et on sépare les arguments
      const args = cmdString.replace(/^\//, "").split(/\s+/);
      const name = args.shift().toLowerCase(); // Récupère le nom de la commande

      const cmd = this.commands.get(name);
      if (!cmd) {
        this.chat.addMessage(`Commande inconnue : /${name}. Tapez /help pour la liste.`, "#ff5555");
        continue; // On passe à la commande suivante au lieu de tout arrêter
      }

      try {
        // On exécute l'action
        cmd.action(args, this.systems, this.chat);
      } catch (err) {
        // On indique dans quelle commande il y a eu une erreur
        this.chat.addMessage(`Erreur d'exécution (/${name}) : ${err.message}`, "#ff5555");
        if (cmd.usage) {
          this.chat.addMessage(`Usage : ${cmd.usage}`, "#ffaaaa");
        }
      }
    }
  }

  // commandes:
  _registerDefaultCommands() {
    
    // /help - Liste les commandes
    this.register("help", {
      usage: "/help",
      description: "Affiche la liste des commandes disponibles.",
      action: (args, systems, chat) => {
        chat.addMessage("--- Commandes disponibles ---", "#ffff55");
        for (const [cmdName, cmdData] of this.commands.entries()) {
          chat.addMessage(`/${cmdName} : ${cmdData.description}`, "#aaaaaa");
        }
      }
    });

    // /tp 
    this.register("tp", {
      usage: "/tp <x> <y> <z>",
      description: "Téléporte le joueur aux coordonnées (x, y, z). Le ~ est supporté.",
      action: (args, { playerController }, chat) => {
        if (args.length !== 3) throw new Error("Nombre d'arguments invalide.");
        
        // On récupère la position actuelle pour les ~
        const pos = playerController.position;
        
        const x = parseCoord(args[0], pos.x);
        const y = parseCoord(args[1], pos.y);
        const z = parseCoord(args[2], pos.z);
        
        playerController.teleport(x, y, z);
        chat.addMessage(`Téléporté à (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`, "#55ff55");
      }
    });

    // /setblock
    this.register("setblock", {
      usage: "/setblock <x> <y> <z> <Nom du bloc>",
      description: "Place un bloc. x=colonne, y=hauteur, z=rangée. Le ~ est supporté.",
      action: (args, { worldManager, blockRegistry, playerController }, chat) => {
        if (args.length < 4) throw new Error("Arguments manquants.");
        const gridPos = TriGrid.worldToGrid(playerController.position);
        const col = Math.floor(parseCoord(args[0], gridPos.col));
        const height = Math.floor(parseCoord(args[1], gridPos.height));
        const row = Math.floor(parseCoord(args[2], gridPos.row));

        const blockName = args.slice(3).join(" ");

        if (blockName.toLowerCase() === "air") {
          worldManager.removeBlock(col, row, height);
          chat.addMessage(`Bloc supprimé en (${col}, ${height}, ${row}).`, "#55ff55");
          return;
        }

        const blockId = blockRegistry.getIdByName(blockName);

        if (blockId === undefined || blockId === null) {
          throw new Error(`Bloc inconnu : "${blockName}". Vérifiez les majuscules.`);
        }
        worldManager.addBlock(col, row, height, blockId);
        chat.addMessage(`Bloc '${blockName}' placé en (${col}, ${height}, ${row}).`, "#55ff55");
      }
    });

    // /gm - Gamemode
    this.register("gm", {
      usage: "/gm <0|1>",
      description: "Change le mode de jeu (0 = Survie, 1 = Créatif).",
      action: (args, { gameMode }, chat) => {
        if (args.length !== 1) throw new Error("Précisez 0 (survie) ou 1 (créatif).");
        
        if (args[0] === "1") {
          gameMode.set("creative");
          chat.addMessage("Mode de jeu défini sur Créatif.", "#55ff55");
        } else if (args[0] === "0") {
          gameMode.set("survival");
          chat.addMessage("Mode de jeu défini sur Survie.", "#55ff55");
        } else {
          throw new Error("Mode inconnu.");
        }
      }
    });
    
    // /loadnbt: Charger une structure
    this.register("loadnbt", {
      usage: "/loadnbt <nom>",
      description: "Ouvre une fenêtre pour charger un fichier .nbt.",
      action: (args, { structureManager }, _chat) => {
        if (args.length !== 1) throw new Error("Veuillez donner un nom à la structure.");
        structureManager.promptLoad(args[0]);
      }
    });

    // /structure: Placer la structure chargée
    this.register("structure", {
      usage: "/structure <nom>",
      description: "Place une structure préalablement chargée.",
      action: (args, { structureManager, playerController, worldManager }, chat) => {
        if (args.length !== 1) throw new Error("Veuillez donner le nom de la structure.");
        structureManager.place(args[0], playerController, worldManager);
        chat.addMessage(`Structure '${args[0]}' construite !`, "#55ff55");
      }
    });
    // /seed
    this.register("seed", {
      usage: "/seed",
      description: "Affiche la seed de génération du monde actuel.",
      action: (args, { chunkManager }, chat) => {
        // On récupère la seed directement dans les options du générateur
        const seed = chunkManager.genOpts.seed;
        
        chat.addMessage(`Seed : ${seed}`, "#ffff55");
      }
    });
    // /clear
    this.register("clear", {
      usage: "/clear",
      description: "Vide entièrement l'inventaire.",
      action: (args, { inventory }, chat) => {
        // La fonction reset() vide tout : slots, grille de craft et curseur
        inventory.reset();
        
        chat.addMessage("Votre inventaire a été vidé.", "#55ff55");
      }
    });
    // /give
    this.register("give", {
      usage: "/give <Nom du bloc> [quantité]",
      description: "Ajoute des blocs directement dans votre inventaire.",
      action: (args, { inventory, blockRegistry }, chat) => {
        if (args.length < 1) throw new Error("Veuillez préciser le nom d'un bloc.");

        let count = 1; // Quantité par défaut
        let nameArgs = args;

        // On vérifie si le dernier argument est un nombre (la quantité)
        const lastArg = args[args.length - 1];
        const parsedCount = parseInt(lastArg, 10);
        
        if (!isNaN(parsedCount)) {
          count = parsedCount;
          nameArgs = args.slice(0, -1); // On retire le nombre de la liste des mots pour le nom du bloc
        }

        const blockName = nameArgs.join(" ");
        const blockId = blockRegistry.getIdByName(blockName);

        if (blockId === undefined || blockId === null) {
          throw new Error(`Bloc inconnu : "${blockName}". Vérifiez les majuscules.`);
        }
        
        if (count <= 0) throw new Error("La quantité doit être supérieure à 0.");

        // On vérifie la taille max d'un stack pour ce bloc (64 par défaut)
        const maxStack = blockRegistry.getMaxStack ? blockRegistry.getMaxStack(blockId) : 64;
        
        // La fonction addItem renvoie le nombre de blocs qui n'ont pas pu rentrer dans l'inventaire
        const remaining = inventory.addItem(blockId, count, maxStack);
        const given = count - remaining;

        if (given > 0) {
          chat.addMessage(`Vous avez reçu ${given} x ${blockName}.`, "#55ff55");
        }
        if (remaining > 0) {
          chat.addMessage(`Inventaire plein ! ${remaining} blocs ont été jetés.`, "#ffaaaa");
        }
      }
    });
  }
}