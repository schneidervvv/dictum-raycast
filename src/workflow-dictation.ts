import {
  closeMainWindow,
  getFrontmostApplication,
  open,
  showHUD,
} from "@raycast/api";
import {
  apiGet,
  apiPost,
  DICTATION_START_TIMEOUT_MS,
  DictumError,
} from "./api";
import { setLastDictationSessionId } from "./dictation-session";
import type {
  DictationStartResponse,
  DictationStatusResponse,
  DictationStopResponse,
} from "./types";

const RAYCAST_BUNDLE_ID = "com.raycast.macos";

/**
 * Closes Raycast and brings back the app you came from. dictum inserts the
 * text into the app that macOS reports as active when the dictation starts,
 * and macOS keeps reporting Raycast as active after its window closes.
 */
export async function returnToPreviousApp(): Promise<void> {
  const previous = await getFrontmostApplication();
  await closeMainWindow();
  if (previous.bundleId !== RAYCAST_BUNDLE_ID) {
    // open sends the app a reopen event, which opens a window in an app that
    // has none (see the README). Activating it with AppleScript instead can
    // raise a macOS Automation consent prompt for Raycast.
    await open(previous.path);
  }
}

export async function startDictationWithWorkflow(workflow: {
  id: string;
  name: string;
}): Promise<void> {
  const status = await apiGet<DictationStatusResponse>("/v1/dictation/status");
  if (status.is_recording) {
    throw new DictumError("A dictation is already running. Stop it first.");
  }

  await returnToPreviousApp();
  const response = await apiPost<DictationStartResponse>(
    "/v1/dictation/start",
    { workflow_id: workflow.id },
    { timeoutMs: DICTATION_START_TIMEOUT_MS },
  );
  // Track the session even if it is stopped outside Raycast.
  await setLastDictationSessionId(response.id);
  await showHUD(`Dictation started with "${workflow.name}"`);
}

export async function stopDictation(): Promise<void> {
  await returnToPreviousApp();
  const response = await apiPost<DictationStopResponse>("/v1/dictation/stop");
  await setLastDictationSessionId(response.id);
  await showHUD("Dictation stopped");
}
