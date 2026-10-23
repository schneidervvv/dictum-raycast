import { Action, ActionPanel, Detail, Icon, Keyboard } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { usePromise } from "@raycast/utils";
import { useEffect, useState } from "react";
import { apiGet, apiPost, errorMessage, DictumError } from "./api";
import {
  getLastRecorderSessionId,
  getRecorderTranscript,
  setRecorderTranscript,
  stopRecording,
} from "./recorder-session";
import {
  TRANSLATION_TARGET_LANGUAGES,
  translationTimeoutMessage,
} from "./translation-languages";
import type { RecorderSessionResponse, TranscribeResponse } from "./types";

const POLL_INTERVAL_MS = 2000;
const RETRY_INTERVAL_MS = 10000;
// Long recordings take a while to transcribe.
const TRANSCRIBE_TIMEOUT_MS = 30 * 60 * 1000;

async function fetchLastRecording(): Promise<RecorderSessionResponse | null> {
  const id = await getLastRecorderSessionId();
  if (!id) {
    return null;
  }

  try {
    const session = await apiGet<RecorderSessionResponse>(
      "/v1/recorder/session",
      { id },
    );
    if (session.status === "completed" && !session.text) {
      const savedText = await getRecorderTranscript(session.id);
      if (savedText) {
        return { ...session, text: savedText };
      }
    }
    return session;
  } catch (error) {
    // dictum keeps recorder sessions only until it quits.
    if (error instanceof DictumError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

function markdownFor(
  session: RecorderSessionResponse | null | undefined,
  error: Error | undefined,
  transcribedText: string | undefined,
): string {
  if (transcribedText) {
    return transcribedText;
  }
  if (error) {
    return `## Could not load the recording\n\n${errorMessage(error, "Unknown error")}`;
  }
  if (session === undefined) {
    return "";
  }
  if (session === null) {
    return "## No recording yet\n\nStart one with **Toggle Recording**. Recordings started before dictum last quit are not shown here.";
  }

  switch (session.status) {
    case "recording":
      return "## Recording…\n\nPress Enter to stop the recording.";
    case "finalizing":
      return "## Transcribing…\n\nThis view updates when the transcript is ready.";
    case "failed":
      return `## Recording failed\n\n${session.error ?? "dictum did not report a reason."}`;
    case "completed":
      if (session.text) {
        return session.text;
      }
      return session.output_file
        ? "## No transcript yet\n\ndictum saved the recording without transcribing it. Press Enter to transcribe it now."
        : "## No transcript\n\ndictum did not save a recording file.";
  }
}

export default function Command() {
  const { isLoading, data, error, revalidate } = usePromise(
    fetchLastRecording,
    [],
    // The view shows the error itself.
    { onError: () => {} },
  );
  // Keyed by recorder session, so a newer recording never shows an older
  // transcript, even if that transcription finishes after the view refreshed.
  const [transcribed, setTranscribed] = useState<{
    sessionId: string;
    text: string;
  }>();
  const [transcribingSessionId, setTranscribingSessionId] = useState<string>();
  const transcribedText =
    transcribed && transcribed.sessionId === data?.id
      ? transcribed.text
      : undefined;
  const isTranscribing =
    transcribingSessionId !== undefined && transcribingSessionId === data?.id;
  // One transcription at a time: a second one could finish first and then be
  // overwritten by the older one.
  const isAnyTranscriptionRunning = transcribingSessionId !== undefined;

  const inProgress =
    data?.status === "recording" || data?.status === "finalizing";

  // While the recording is still running or transcribing, refresh often;
  // after a failed check, keep trying at a slower pace.
  useEffect(() => {
    // A failed check clears `data`, so `inProgress` alone would stop retrying.
    if (!inProgress && !error) {
      return;
    }
    const timer = setInterval(
      revalidate,
      error ? RETRY_INTERVAL_MS : POLL_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [inProgress, error, revalidate]);

  async function stop() {
    try {
      await stopRecording();
      revalidate();
    } catch (error) {
      await showFailureToast(errorMessage(error, "Failed to stop recording"), {
        title: "dictum",
      });
    }
  }

  async function transcribe(
    sessionId: string,
    path: string,
    targetLanguage?: string,
  ) {
    setTranscribingSessionId(sessionId);
    try {
      const result = await apiPost<TranscribeResponse>(
        "/v1/transcribe/local-file",
        { path, target_language: targetLanguage },
        {
          timeoutMs: TRANSCRIBE_TIMEOUT_MS,
          timeoutMessage: targetLanguage
            ? translationTimeoutMessage(targetLanguage)
            : "Transcribing the recording took too long.",
        },
      );
      await setRecorderTranscript(sessionId, result.text);
      setTranscribed({ sessionId, text: result.text });
    } catch (err) {
      await showFailureToast(errorMessage(err, "Failed to transcribe"), {
        title: "dictum",
      });
    } finally {
      setTranscribingSessionId((current) =>
        current === sessionId ? undefined : current,
      );
    }
  }

  const transcript =
    transcribedText ??
    (data?.status === "completed" ? (data.text ?? undefined) : undefined);
  const outputFile = data?.output_file ?? undefined;
  const canTranscribe =
    data?.status === "completed" && !transcript && outputFile !== undefined;

  return (
    <Detail
      isLoading={isLoading || inProgress || isTranscribing}
      markdown={markdownFor(data, error, transcribedText)}
      actions={
        <ActionPanel>
          {data?.status === "recording" && (
            <Action title="Stop Recording" icon={Icon.Stop} onAction={stop} />
          )}
          {canTranscribe && !isAnyTranscriptionRunning && (
            <>
              <Action
                title="Transcribe Recording"
                icon={Icon.Microphone}
                onAction={() => data && transcribe(data.id, outputFile)}
              />
              <ActionPanel.Submenu
                title="Transcribe and Translate to"
                icon={Icon.Globe}
              >
                {TRANSLATION_TARGET_LANGUAGES.map((language) => (
                  <Action
                    key={language.code}
                    title={language.title}
                    onAction={() =>
                      data && transcribe(data.id, outputFile, language.code)
                    }
                  />
                ))}
              </ActionPanel.Submenu>
            </>
          )}
          {transcript && (
            <>
              <Action.CopyToClipboard
                title="Copy Transcript"
                content={transcript}
              />
              <Action.Paste title="Paste Transcript" content={transcript} />
            </>
          )}
          {outputFile && (
            <>
              <Action.Open
                title="Open Recording"
                target={outputFile}
                icon={Icon.Play}
              />
              <Action.ShowInFinder path={outputFile} />
            </>
          )}
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={revalidate}
          />
        </ActionPanel>
      }
    />
  );
}
