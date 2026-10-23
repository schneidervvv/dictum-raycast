import { getPreferenceValues } from "@raycast/api";
import { readFileSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { Agent, fetch as undiciFetch } from "undici";
import type { ApiError } from "./types";

const DEFAULT_PORT = 8978;
const TIMEOUT_MS = 10000;
// Node's fetch stops waiting for the response after 5 minutes on its own,
// whatever the request's timeout allows.
const FETCH_DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
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
    const onPort = instances.filter(
      (instance) => instance.port === overridePort,
    );
    return onPort.length > 0 ? onPort : [{ port: overridePort, writtenAt: 0 }];
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
let commandInstance: Pick<DiscoveredInstance, "port" | "token"> | undefined;

const instanceGoneMessage =
  "The dictum instance this command was using is no longer running. Reopen the command.";

// The Release and the Dev build can share a port, so the port alone does not
// tell them apart; their tokens do.
function isCommandInstance(instance: DiscoveredInstance): boolean {
  return (
    instance.port === commandInstance?.port &&
    instance.token === commandInstance?.token
  );
}

/** Discovered instances, the one this command settled on first. */
function candidateInstances(): DiscoveredInstance[] {
  const instances = discoverInstances();
  const index = instances.findIndex(isCommandInstance);
  return index > 0
    ? [instances[index], ...instances.filter((_, i) => i !== index)]
    : instances;
}

function errorCode(error: unknown): unknown {
  return (error as { cause?: { code?: unknown } } | null)?.cause?.code;
}

function isConnectionRefused(error: unknown): boolean {
  return errorCode(error) === "ECONNREFUSED";
}

// Failures before the request reached dictum, or dictum went away.
const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function isTimeout(error: unknown): boolean {
  const code = errorCode(error);
  return (
    (error instanceof DOMException && error.name === "TimeoutError") ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    code === "UND_ERR_BODY_TIMEOUT"
  );
}

const longRequestDispatchers = new Map<number, Agent>();

/** A dispatcher that waits as long as the request's own timeout. */
function dispatcherFor(timeoutMs: number): Agent | undefined {
  if (timeoutMs <= FETCH_DEFAULT_TIMEOUT_MS) {
    return undefined;
  }
  let dispatcher = longRequestDispatchers.get(timeoutMs);
  if (!dispatcher) {
    dispatcher = new Agent({
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
    longRequestDispatchers.set(timeoutMs, dispatcher);
  }
  return dispatcher;
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
  const isBound = commandInstance !== undefined;
  let candidates = candidateInstances();
  if (isBound) {
    const bound = candidates.find(isCommandInstance);
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

    const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
    const dispatcher = dispatcherFor(timeoutMs);
    // A dispatcher works only with the fetch of the same undici package, and
    // Node's own fetch comes from another undici version.
    const send = (dispatcher ? undiciFetch : fetch) as typeof fetch;
    let response: Response;
    try {
      response = await send(url.toString(), {
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
        signal: AbortSignal.timeout(timeoutMs),
        // The DOM RequestInit type does not list undici's dispatcher.
        dispatcher,
      } as RequestInit);
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
      if (isTimeout(error)) {
        throw new DictumError(
          options.timeoutMessage ?? "Request timed out. Is dictum running?",
        );
      }
      if (CONNECTION_ERROR_CODES.has(String(errorCode(error)))) {
        throw new DictumError(
          "Cannot connect to dictum. Make sure the app is running and the API server is enabled in Settings > Advanced.",
        );
      }
      throw new DictumError(
        // fetch reports every failure as "fetch failed"; the cause says why.
        `The request to dictum failed: ${String((error as { cause?: { message?: unknown } }).cause?.message ?? error)}`,
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
    commandInstance ??= { port: instance.port, token: instance.token };
    if (!isCommandInstance(instance)) {
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
