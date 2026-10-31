import { apiFetch } from "./api";
import type { GameData } from "./game";

export interface BlueprintIssue {
  field: string;
  message: string;
}

export type BlueprintValidation =
  | {
      valid: true;
      data: GameData;
      issues: BlueprintIssue[];
      warnings: string[];
    }
  | {
      valid: false;
      data: null;
      issues: BlueprintIssue[];
      warnings: string[];
    };

export function validateBlueprint(
  projectId: number, document: unknown,
): Promise<BlueprintValidation> {
  return apiFetch<BlueprintValidation>(
    `/api/v1/projects/${projectId}/game/validate-import`,
    { method: "POST", body: document },
  );
}

export function blueprintExport(projectId: number, data: GameData) {
  return {
    format: "indaverse-game-blueprint",
    format_version: 1,
    source_project_id: projectId,
    exported_at: new Date().toISOString(),
    blueprint: data,
  };
}
