import { getPreferenceValues } from "@raycast/api";
import { readFileSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { ApiError } from "./types";

const DEFAULT_PORT = 8978;
const TIMEOUT_MS = 10000;
// dictum answers a dictation start only after the model is ready,
// which can include loading a local model.
export const DICTATION_START_TIMEOUT_MS = 5 * 60 * 1000;

export class DictumError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "DictumError";
  }
}

interface Edition {
  bundleId: string;
  appSupportFolder: string;
}

/** The Release build first, then the Dev build. */
const EDITIONS: Edition[] = [
  { bundleId: "com.schneidervvv.dictum", appSupportFolder: "dictum" },
  { bundleId: "com.schneidervvv.dictum.dev", appSupportFolder: "dictum-Dev" },
];

interface DiscoveredInstance {
  port: number;
  token?: string;
  writtenAt: number;
  bundleId?: string;
}

function appSupportDirectory(edition: Edition): string {
  return join(
    homedir(),
    "Library",
    "Application Support",
    edition.appSupportFolder,
  );
}

function parsePort(value: unknown): number | null {
  const port = typeof value === "number" ? value : parseInt(String(value), 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

// dictum writes api-discovery.json (port and API token) while its API server
// runs and deletes it when the server stops.
function readInstance(edition: Edition): DiscoveredInstance | null {
  try {
    const path = join(appSupportDirectory(edition), "api-discovery.json");
    const document = JSON.parse(readFileSync(path, "utf-8")) as {
      port?: unknown;
      token?: unknown;
    };
    const port = parsePort(document.port);
    if (!port) {
      return null;
    }
    const token =
      typeof document.token === "string" && document.token.trim() !== ""
        ? document.token.trim()
        : undefined;
    return {
      port,
      token,
      writtenAt: statSync(path).mtimeMs,
      bundleId: edition.bundleId,
    };
  } catch {
    return null;
  }
}

function discoverInstances(): DiscoveredInstance[] {
  const instances = EDITIONS.map(readInstance)
    .filter((instance): instance is DiscoveredInstance => instance !== null)
    // A crashed app can leave its files behind. The newest file usually
    // belongs to the instance that started its API server last.
    .sort((a, b) => b.writtenAt - a.writtenAt);

  const prefs = getPreferenceValues<Preferences>();
  const overridePort = prefs.port ? parsePort(prefs.port.trim()) : null;
  if (overridePort) {
    const match = instances.find((instance) => instance.port === overridePort);
    return [{ port: overridePort, token: match?.token, writtenAt: 0 }];
  }

  return instances.length > 0
    ? instances
    : [{ port: DEFAULT_PORT, writtenAt: 0 }];
}

/**
 * Bundle IDs to open, best first: editions whose API server runs, newest
 * first, then the Release and the Dev build.
 */
export function dictumBundleIds(): string[] {
  const running = discoverInstances().flatMap((instance) =>
    instance.bundleId ? [instance.bundleId] : [],
  );
  return [...new Set([...running, ...EDITIONS.map((e) => e.bundleId)])];
}

/**
 * The instance this command settled on: the first one that answered. Every
 * later request goes there, reads and writes alike, so a list, the status
 * checks next to it, and the actions on its rows all talk to the same
 * dictum. Commands run in their own process, so this resets per command.
 */
let commandInstancePort: number | undefined;

const instanceGoneMessage =
  "The dictum instance this command was using is no longer running. Reopen the command.";

/** Discovered instances, the preferred one first. */
function candidateInstances(preferredPort?: number): DiscoveredInstance[] {
  const instances = discoverInstances();
  const index = instances.findIndex((i) => i.port === preferredPort);
  return index > 0
    ? [instances[index], ...instances.filter((_, i) => i !== index)]
    : instances;
}

function isConnectionRefused(error: unknown): boolean {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  return cause?.code === "ECONNREFUSED";
}

async function parseApiResponse<T>(
  response: Response,
  sentToken: boolean,
): Promise<T> {
  if (response.status === 401) {
    throw new DictumError(
      sentToken
        ? "dictum rejected the API token. Restart dictum and try again."
        : "dictum requires an API token, but none was found. Restart dictum, then try again.",
      401,
    );
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const errorBody = (await response.json()) as ApiError;
      message = errorBody.error?.message || message;
    } catch {
      // ignore parse errors
    }
    throw new DictumError(message, response.status);
  }

  return (await response.json()) as T;
}

interface RequestOptions {
  params?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  timeoutMessage?: string;
}

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const isMultipart = options.body instanceof FormData;
  const hasJsonBody = options.body !== undefined && !isMultipart;
  const isBound = commandInstancePort !== undefined;
  let candidates = candidateInstances(commandInstancePort);
  if (isBound) {
    const bound = candidates.find((i) => i.port === commandInstancePort);
    if (!bound) {
      throw new DictumError(instanceGoneMessage);
    }
    candidates = [bound];
  }

  for (const [index, instance] of candidates.entries()) {
    const url = new URL(path, `http://127.0.0.1:${instance.port}`);
    // dictum decodes percent escapes only, so a space must not become "+".
    url.search = Object.entries(options.params ?? {})
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join("&");

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method,
        headers: {
          ...(instance.token
            ? { Authorization: `Bearer ${instance.token}` }
            : {}),
          ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
        },
        body: isMultipart
          ? (options.body as FormData)
          : hasJsonBody
            ? JSON.stringify(options.body)
            : undefined,
        signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      });
    } catch (error) {
      // A refused connection means nothing reached dictum, so trying the
      // next instance cannot run a request twice.
      if (isConnectionRefused(error)) {
        if (index < candidates.length - 1) {
          continue;
        }
        if (isBound) {
          throw new DictumError(instanceGoneMessage);
        }
      }
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new DictumError(
          options.timeoutMessage ?? "Request timed out. Is dictum running?",
        );
      }
      throw new DictumError(
        "Cannot connect to dictum. Make sure the app is running and the API server is enabled in Settings > Advanced.",
      );
    }

    // The Release and the Dev build share a default port, so the newest
    // discovery file can hold the token of the build that did not get the
    // port. dictum ran nothing for a 401, so the next instance is safe.
    if (response.status === 401 && !isBound && index < candidates.length - 1) {
      continue;
    }

    // Requests started together before the first answer each pick their own
    // instance. The first answer settles the command; a response that came
    // from another instance is dropped, so its data never sits next to rows
    // whose actions go to the settled one.
    commandInstancePort ??= instance.port;
    if (commandInstancePort !== instance.port) {
      throw new DictumError(instanceGoneMessage);
    }
    return parseApiResponse<T>(response, Boolean(instance.token));
  }

  throw new DictumError("No dictum instance found.");
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  return request<T>("GET", path, { params });
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  options: Omit<RequestOptions, "body"> = {},
): Promise<T> {
  return request<T>("POST", path, { ...options, body });
}

export async function apiPut<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  return request<T>("PUT", path, { params });
}

export async function apiPutJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>("PUT", path, { body });
}

export async function apiDelete<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  return request<T>("DELETE", path, { params });
}

export async function apiDeleteJson<T>(
  path: string,
  body: unknown,
): Promise<T> {
  return request<T>("DELETE", path, { body });
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof DictumError ? error.message : fallback;
}

export async function apiPostMultipart<T>(
  path: string,
  formData: FormData,
  timeoutMessage = "Transcription timed out.",
): Promise<T> {
  return request<T>("POST", path, {
    body: formData,
    timeoutMs: 60000,
    timeoutMessage,
  });
}
