import { apiFetch } from "./api";

export type SectionKind = "hero" | "text" | "cards" | "form" | "call_to_action";

export interface SoftwareSection {
  id: string;
  kind: SectionKind;
  heading: string;
  content: string;
}

export interface SoftwarePage {
  id: string;
  name: string;
  path: string;
  sections: SoftwareSection[];
}

export interface SoftwareFeature {
  id: string;
  title: string;
  description: string;
  priority: "must_have" | "should_have" | "later";
}

export interface SoftwareData {
  title: string;
  description: string;
  platform: "web" | "mobile" | "web_and_mobile";
  pages: SoftwarePage[];
  features: SoftwareFeature[];
}

export interface SoftwareProject extends SoftwareData {
  project_id: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export function getSoftware(projectId: number): Promise<SoftwareProject> {
  return apiFetch<SoftwareProject>(`/api/v1/projects/${projectId}/software`);
}

export function saveSoftware(
  projectId: number,
  data: SoftwareData,
  expectedVersion: number,
): Promise<SoftwareProject> {
  return apiFetch<SoftwareProject>(`/api/v1/projects/${projectId}/software`, {
    method: "PUT",
    body: { ...data, expected_version: expectedVersion },
  });
}
