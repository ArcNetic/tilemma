import {
  CheckResponseSchema,
  LevelSummarySchema,
  PublicLevelSchema,
  type CheckRequest,
  type CheckResponse,
  type LevelSummary,
  type PublicLevel,
} from "@pp/engine";
import { z } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly offline: boolean,
  ) {
    super(message);
  }
}

const getJson = async <T,>(url: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Cannot reach the server", true);
  }
  if (!response.ok) throw new ApiError(`Server returned ${response.status}`, false);
  return schema.parse(await response.json());
};

export const fetchLevels = (signal?: AbortSignal): Promise<LevelSummary[]> => getJson("/api/levels", z.array(LevelSummarySchema), signal);

export const fetchLevel = (id: string, signal?: AbortSignal): Promise<PublicLevel> => getJson(`/api/levels/${id}`, PublicLevelSchema, signal);

export const fetchHealth = async (signal?: AbortSignal): Promise<boolean> => {
  try {
    const response = await fetch("/api/health", { signal });
    return response.ok;
  } catch {
    return false;
  }
};

const rateLimited = (): CheckResponse => ({
  status: "BUSY",
  states: [],
  lineStates: [],
  diagnostics: [
    { pane: "proof", line: 1, colStart: 0, colEnd: 1, severity: "error", code: "RATE_LIMITED", message: "Too many checks in a minute. Slow down a little." },
  ],
  axiomsOk: null,
  leanMs: 0,
  cached: false,
});

export const postCheck = async (request: CheckRequest, signal?: AbortSignal): Promise<CheckResponse> => {
  let response: Response;
  try {
    response = await fetch("/api/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Cannot reach the server", true);
  }
  if (response.status !== 200 && response.status !== 429) throw new ApiError(`Server returned ${response.status}`, false);
  const body: unknown = await response.json().catch(() => null);
  const parsed = CheckResponseSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  if (response.status === 429) return rateLimited();
  throw new ApiError("Unexpected response from the server", false);
};
