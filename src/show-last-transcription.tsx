import { Clipboard, closeMainWindow, showHUD } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { apiGet, DictumError } from "./api";
import { fetchLastKnownDictationTranscription } from "./dictation-session";
import type { HistoryResponse } from "./types";

async function copyAndPreview(text: string) {
  await Clipboard.copy(text);
  await closeMainWindow();

  const preview = text.length > 60 ? text.substring(0, 60) + "..." : text;
  await showHUD(`Copied: ${preview}`);
}

export default async function Command() {
  try {
    const sessionResponse = await fetchLastKnownDictationTranscription();
    if (sessionResponse) {
      if (
        sessionResponse.status === "completed" &&
        sessionResponse.transcription?.text
      ) {
        await copyAndPreview(sessionResponse.transcription.text);
        return;
      }

      if (sessionResponse.status === "processing") {
        await showHUD("Last dictation is still processing");
        return;
      }

      if (sessionResponse.status === "recording") {
        await showHUD("Dictation is still recording");
        return;
      }

      if (sessionResponse.status === "failed") {
        await showFailureToast(
          sessionResponse.error || "The last dictation failed",
          { title: "dictum" },
        );
        return;
      }
    }

    // 已取消的录音没有插入过，取最近一条没有取消的记录。
    const response = await apiGet<HistoryResponse>("/v1/history", {
      limit: "10",
    });
    const latest = response.entries.find((entry) => !entry.cancelled);

    if (!latest) {
      await showHUD("No transcriptions yet");
      return;
    }

    await copyAndPreview(latest.text);
  } catch (error) {
    if (error instanceof DictumError) {
      await showFailureToast(error.message, { title: "dictum" });
    } else {
      await showFailureToast("An unexpected error occurred", {
        title: "dictum",
      });
    }
  }
}
