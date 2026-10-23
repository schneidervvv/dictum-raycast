import { LocalStorage } from "@raycast/api";
import { apiPost, DictumError } from "./api";
import type { RecorderStopResponse } from "./types";

const LAST_RECORDER_SESSION_ID_KEY = "last-recorder-session-id";
const LAST_RECORDER_TRANSCRIPT_KEY = "last-recorder-transcript";

export async function setLastRecorderSessionId(id: string): Promise<void> {
  await LocalStorage.setItem(LAST_RECORDER_SESSION_ID_KEY, id);
}

export async function getLastRecorderSessionId(): Promise<string | undefined> {
  const id = await LocalStorage.getItem<string>(LAST_RECORDER_SESSION_ID_KEY);
  return id ?? undefined;
}

export async function stopRecording(): Promise<RecorderStopResponse> {
  let response: RecorderStopResponse;
  try {
    response = await apiPost<RecorderStopResponse>("/v1/recorder/stop");
  } catch (error) {
    if (error instanceof DictumError && error.statusCode === 409) {
      // The API can only stop recordings it started itself.
      throw new DictumError(
        "This recording was started in dictum. Stop it there.",
      );
    }
    throw error;
  }
  await setLastRecorderSessionId(response.id);
  return response;
}

// Transcripts made from Raycast are not stored in the recorder session, so
// keep the one for the last session to show it again later.
export async function setRecorderTranscript(
  sessionId: string,
  text: string,
): Promise<void> {
  await LocalStorage.setItem(
    LAST_RECORDER_TRANSCRIPT_KEY,
    JSON.stringify({ sessionId, text }),
  );
}

export async function getRecorderTranscript(
  sessionId: string,
): Promise<string | undefined> {
  const stored = await LocalStorage.getItem<string>(
    LAST_RECORDER_TRANSCRIPT_KEY,
  );
  if (!stored) {
    return undefined;
  }
  try {
    const value = JSON.parse(stored) as { sessionId?: string; text?: string };
    return value.sessionId === sessionId ? value.text : undefined;
  } catch {
    return undefined;
  }
}
