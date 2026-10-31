import type { GameData } from "./game";

export const GAME_TEMPLATES = [
  {
    id: "exploration-2d",
    name: "2D exploration",
    description: "A short journey with collecting, route discovery, and a final objective.",
  },
  {
    id: "puzzle-2d",
    name: "2D puzzle",
    description: "An introduction, a practice challenge, and a final puzzle.",
  },
  {
    id: "exploration-3d",
    name: "3D exploration",
    description: "A village, an outdoor route, and a destination to investigate.",
  },
] as const;

export type GameTemplateId = typeof GAME_TEMPLATES[number]["id"];

export function createGameTemplate(id: GameTemplateId): GameData {
  const uuid = () => crypto.randomUUID();

  const blueprint: GameData = {
    title: "The River Trail",
    dimension: "2d",
    genre: "Adventure / Exploration",
    concept: "Help an explorer reconnect a riverside community by discovering routes and gathering repair supplies.",
    core_loop: "Explore, speak to villagers, collect supplies, solve a route obstacle, and unlock the next location.",
    controls: "Arrow keys or A/D to move, Space to jump, E to interact. Plan equivalent touch controls.",
    characters: [
      {
        id: uuid(), name: "Explorer", role: "player", image_id: null,
        description: "A resourceful traveller with a distinctive outfit and a small backpack.",
      },
      {
        id: uuid(), name: "Village guide", role: "npc", image_id: null,
        description: "Explains the objective and offers clues when the player needs help.",
      },
    ],
    levels: [
      {
        id: uuid(), title: "Village introduction", image_id: null,
        setting: "A riverside village with clear landmarks.",
        objective: "Learn movement, meet the guide, and find the first supply.",
        challenges: "Introduce one safe obstacle and explain how to recover after a fall.",
      },
      {
        id: uuid(), title: "River crossing", image_id: null,
        setting: "Docks, small islands, and a damaged crossing.",
        objective: "Gather the required supplies and reach the opposite bank.",
        challenges: "Combine earlier skills with wider gaps and a simple route puzzle.",
      },
      {
        id: uuid(), title: "The restored route", image_id: null,
        setting: "A destination beyond the river.",
        objective: "Use the supplies to complete the repair and reach the finish.",
        challenges: "Provide a final test of the skills taught in earlier levels.",
      },
    ],
    assets: [
      {
        id: uuid(), title: "Explorer sprite sheet", kind: "sprite",
        description: "Consistent idle, running, jumping, and interaction frames with transparent backgrounds.",
      },
      {
        id: uuid(), title: "Environment tiles", kind: "environment",
        description: "Ground, water, docks, vegetation, and village structures in one consistent scale.",
      },
      {
        id: uuid(), title: "Game interface", kind: "ui",
        description: "Objective tracker, item count, pause menu, interaction prompts, and touch buttons.",
      },
      {
        id: uuid(), title: "Music and sound", kind: "audio",
        description: "Original or licensed ambience, movement, collection, and completion sounds. Include mute controls.",
      },
    ],
  };

  if (id === "puzzle-2d") {
    blueprint.title = "The Workshop Puzzle";
    blueprint.genre = "Puzzle / Exploration";
    blueprint.concept = "Restore a community workshop by observing clues and activating mechanisms in the correct order.";
    blueprint.core_loop = "Observe, form a solution, test a mechanism, receive clear feedback, and unlock the next challenge.";
    blueprint.controls = "Arrow keys or WASD to move; E to interact; Escape to pause. Provide accessible touch alternatives.";
    blueprint.levels = [
      {
        id: uuid(), title: "Learn the mechanism", image_id: null,
        setting: "A small workshop with one switch and one visible result.",
        objective: "Activate the switch and learn how feedback is shown.",
        challenges: "Use a forgiving introduction with no permanent failure.",
      },
      {
        id: uuid(), title: "Read the clues", image_id: null,
        setting: "A courtyard with three labelled mechanisms.",
        objective: "Use an environmental clue to activate the correct sequence.",
        challenges: "An incorrect sequence resets the puzzle and allows another attempt.",
      },
      {
        id: uuid(), title: "Restore the workshop", image_id: null,
        setting: "The main workshop with the final mechanism.",
        objective: "Combine the learned rules and restore the workshop.",
        challenges: "Make the solution understandable from earlier clues; provide an optional hint.",
      },
    ];
    blueprint.assets.push({
      id: uuid(), title: "Mechanism feedback animations", kind: "animation",
      description: "Switch, door, success, and reset animations with readable visual feedback.",
    });
  }

  if (id === "exploration-3d") {
    blueprint.title = "The Lost Valley";
    blueprint.dimension = "3d";
    blueprint.genre = "Adventure / 3D Exploration";
    blueprint.concept = "Explore an abandoned valley, gather evidence about its history, and help nearby villagers restore access to a lost settlement.";
    blueprint.core_loop = "Explore landmarks, collect clues, speak to characters, solve environmental obstacles, and unlock a new area.";
    blueprint.controls = "WASD movement, Space to jump, E to interact, Escape to pause. Specify camera and touch controls before implementing custom gameplay.";
    blueprint.levels = [
      {
        id: uuid(), title: "The village", image_id: null,
        setting: "A compact village with a central gathering area and recognisable landmarks.",
        objective: "Meet the guide, learn movement, and collect the first clue.",
        challenges: "Introduce interaction and navigation in a safe area.",
      },
      {
        id: uuid(), title: "The valley trail", image_id: null,
        setting: "An outdoor path with terrain changes and a damaged crossing.",
        objective: "Find a route through the valley and gather supplies.",
        challenges: "Teach traversal progressively and provide clear recovery points.",
      },
      {
        id: uuid(), title: "The lost settlement", image_id: null,
        setting: "Weathered buildings, a courtyard, and a blocked entrance.",
        objective: "Use collected clues to open the entrance and finish the exploration.",
        challenges: "Resolve an environmental puzzle based on evidence gathered along the trail.",
      },
    ];
    blueprint.assets = [
      {
        id: uuid(), title: "Explorer character", kind: "model",
        description: "A lightweight GLB/glTF character with clear proportions and a consistent outfit.",
      },
      {
        id: uuid(), title: "Village and terrain kit", kind: "environment",
        description: "Reusable buildings, paths, rocks, vegetation, and terrain components with consistent scale.",
      },
      {
        id: uuid(), title: "Surface materials", kind: "material",
        description: "A consistent set of stone, clay, wood, soil, and fabric materials.",
      },
      {
        id: uuid(), title: "Character movement", kind: "animation",
        description: "Idle, walk, run, jump, land, and interaction animations compatible with the chosen character rig.",
      },
      {
        id: uuid(), title: "Interface and prompts", kind: "ui",
        description: "Objectives, dialogue panels, interaction prompts, pause menu, and touch controls.",
      },
      {
        id: uuid(), title: "Valley ambience", kind: "audio",
        description: "Original or licensed environmental ambience, footsteps, interactions, and completion sounds.",
      },
    ];
  }

  return blueprint;
}
