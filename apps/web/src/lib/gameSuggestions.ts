import type { GameData } from "./game";

export interface GameSuggestion {
  id: string;
  label: string;
  reason: string;
  patch: Partial<GameData>;
}

export function suggestGameCompletion(data: GameData): GameSuggestion[] {
  const suggestions: GameSuggestion[] = [];
  const three = data.dimension === "3d";

  if (!data.genre.trim()) suggestions.push({
    id: "genre",
    label: "Genre",
    reason: "No genre has been entered.",
    patch: { genre: "Adventure / Exploration" },
  });

  if (!data.concept.trim()) suggestions.push({
    id: "concept",
    label: "Game concept",
    reason: "The concept is blank.",
    patch: {
      concept: "Guide an explorer through a small community and its surrounding landscape. Help the inhabitants solve a practical problem by discovering clues and gathering useful supplies.",
    },
  });

  if (!data.core_loop.trim()) suggestions.push({
    id: "core_loop",
    label: "Core gameplay loop",
    reason: "The core gameplay loop is blank.",
    patch: {
      core_loop: "Explore a location, discover a clue, collect a useful item, solve an obstacle, and unlock the next objective. Give clear feedback after each completed action.",
    },
  });

  if (!data.controls.trim()) suggestions.push({
    id: "controls",
    label: "Controls",
    reason: "No controls have been described.",
    patch: {
      controls: three
        ? "WASD or arrow keys to move, Space to jump, E to interact, Escape to pause. Define camera behaviour and equivalent touch controls before implementing custom gameplay."
        : "A/D or arrow keys to move, Space to jump, E to interact, Escape to pause. Provide equivalent movement, jump, and interaction touch buttons.",
    },
  });

  if (data.characters.length === 0) suggestions.push({
    id: "characters",
    label: "Starter player character",
    reason: "No characters have been added.",
    patch: { characters: [{
      id: crypto.randomUUID(),
      name: "Explorer",
      role: "player",
      image_id: null,
      description: "A resourceful explorer with a recognisable outfit. Adapt the name, appearance, abilities, and background to your own story.",
    }] },
  });

  if (data.levels.length === 0) suggestions.push({
    id: "levels",
    label: "Introductory level",
    reason: "No levels have been added.",
    patch: { levels: [{
      id: crypto.randomUUID(),
      title: "The first journey",
      image_id: null,
      setting: "A compact starting area with clear landmarks and a visible destination.",
      objective: "Learn movement, discover one clue, collect the required supplies, and reach the marked destination.",
      challenges: "Introduce one obstacle at a time. Explain recovery after failure and provide a safe route for practising controls.",
    }] },
  });

  if (data.assets.length === 0) suggestions.push({
    id: "assets",
    label: "Starter asset requirements",
    reason: "No asset requirements have been added.",
    patch: { assets: [
      {
        id: crypto.randomUUID(),
        title: three ? "Player character model" : "Player sprite sheet",
        kind: three ? "model" : "sprite",
        description: three
          ? "A lightweight character model with consistent scale and a compatible animation rig."
          : "Consistent idle, movement, jumping, and interaction frames with transparent backgrounds.",
      },
      {
        id: crypto.randomUUID(),
        title: "Starting environment",
        kind: "environment",
        description: "Reusable ground, structures, landmarks, and interactive objects with a consistent visual style.",
      },
      {
        id: crypto.randomUUID(),
        title: "Gameplay interface",
        kind: "ui",
        description: "Readable objectives, interaction prompts, item counters, pause menu, and touch controls.",
      },
    ] },
  });

  return suggestions;
}
