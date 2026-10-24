import {
  Action,
  ActionPanel,
  Detail,
  Form,
  getSelectedFinderItems,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { readFileSync, statSync } from "fs";
import { basename } from "path";
import { apiPostMultipart, DictumError } from "./api";
import {
  TRANSLATION_TARGET_LANGUAGES,
  translationTimeoutMessage,
} from "./translation-languages";
import type { TranscribeResponse } from "./types";

const NO_TRANSLATION = "none";

const AUDIO_EXTENSIONS = [
  "wav",
  "mp3",
  "m4a",
  "flac",
  "ogg",
  "aac",
  "mp4",
  "webm",
];

function isSupportedAudioFile(filePath: string) {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (!AUDIO_EXTENSIONS.includes(ext)) {
    return false;
  }

  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function TranscriptionResult({
  result,
  fileName,
}: {
  result: TranscribeResponse;
  fileName: string;
}) {
  const markdown = `## Transcription\n\n${result.text}`;

  return (
    <Detail
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="File" text={fileName} />
          <Detail.Metadata.Label
            title="Duration"
            text={`${result.duration.toFixed(1)}s`}
          />
          <Detail.Metadata.Label
            title="Processing Time"
            text={`${result.processing_time.toFixed(1)}s`}
          />
          <Detail.Metadata.Label title="Engine" text={result.engine} />
          {result.model && (
            <Detail.Metadata.Label title="Model" text={result.model} />
          )}
          {result.language && (
            <Detail.Metadata.Label title="Language" text={result.language} />
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Text" content={result.text} />
          <Action.Paste title="Paste Text" content={result.text} />
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const { push } = useNavigation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const didChooseFile = useRef(false);

  useEffect(() => {
    if (process.platform !== "darwin") {
      return;
    }

    let isMounted = true;

    async function prefillSelectedFinderFile() {
      try {
        const selectedItems = await getSelectedFinderItems();
        const selectedAudioFile = selectedItems
          .map((item) => item.path)
          .find(isSupportedAudioFile);

        if (selectedAudioFile && isMounted) {
          setSelectedFiles((currentFiles) => {
            if (didChooseFile.current || currentFiles.length > 0) {
              return currentFiles;
            }

            return [selectedAudioFile];
          });
        }
      } catch {
        // Keep the file picker empty when Finder is not active or has no usable selection.
      }
    }

    void prefillSelectedFinderFile();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleFileChange(files: string[]) {
    didChooseFile.current = true;
    setSelectedFiles(files);
  }

  async function handleSubmit(values: {
    file: string[];
    language: string;
    targetLanguage: string;
  }) {
    const filePath = values.file?.[0];
    if (!filePath) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Please select an audio file",
      });
      return;
    }

    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    if (!AUDIO_EXTENSIONS.includes(ext)) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Unsupported format: .${ext}`,
      });
      return;
    }

    setIsSubmitting(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Transcribing...",
      message: basename(filePath),
    });

    try {
      const fileBuffer = readFileSync(filePath);
      const blob = new Blob([fileBuffer]);
      const formData = new FormData();
      formData.append("file", blob, basename(filePath));

      if (values.language && values.language !== "auto") {
        formData.append("language", values.language);
      }
      const translates = values.targetLanguage !== NO_TRANSLATION;
      if (translates) {
        formData.append("target_language", values.targetLanguage);
      }

      const result = await apiPostMultipart<TranscribeResponse>(
        "/v1/transcribe",
        formData,
        translates
          ? translationTimeoutMessage(values.targetLanguage)
          : undefined,
      );
      toast.hide();
      push(
        <TranscriptionResult result={result} fileName={basename(filePath)} />,
      );
    } catch (error) {
      const msg =
        error instanceof DictumError ? error.message : "Transcription failed";
      toast.style = Toast.Style.Failure;
      toast.title = msg;
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Transcribe" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="file"
        title="Audio File"
        value={selectedFiles}
        onChange={handleFileChange}
        allowMultipleSelection={false}
        canChooseDirectories={false}
      />
      <Form.Dropdown id="language" title="Language" defaultValue="auto">
        <Form.Dropdown.Item value="auto" title="Auto-detect" />
        <Form.Dropdown.Item value="en" title="English" />
        <Form.Dropdown.Item value="de" title="German" />
        <Form.Dropdown.Item value="fr" title="French" />
        <Form.Dropdown.Item value="es" title="Spanish" />
        <Form.Dropdown.Item value="it" title="Italian" />
        <Form.Dropdown.Item value="pt" title="Portuguese" />
        <Form.Dropdown.Item value="nl" title="Dutch" />
        <Form.Dropdown.Item value="ja" title="Japanese" />
        <Form.Dropdown.Item value="ko" title="Korean" />
        <Form.Dropdown.Item value="zh" title="Chinese" />
      </Form.Dropdown>
      <Form.Dropdown
        id="targetLanguage"
        title="Translate to"
        defaultValue={NO_TRANSLATION}
      >
        <Form.Dropdown.Item value={NO_TRANSLATION} title="Don't Translate" />
        {TRANSLATION_TARGET_LANGUAGES.map((language) => (
          <Form.Dropdown.Item
            key={language.code}
            value={language.code}
            title={language.title}
          />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
