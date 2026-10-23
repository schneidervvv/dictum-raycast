/** The languages dictum's API can translate a transcript into. */
export const TRANSLATION_TARGET_LANGUAGES = [
  { code: "ar", title: "Arabic" },
  { code: "zh-Hans", title: "Chinese, Simplified" },
  { code: "zh-Hant", title: "Chinese, Traditional" },
  { code: "nl", title: "Dutch" },
  { code: "en", title: "English" },
  { code: "fr", title: "French" },
  { code: "de", title: "German" },
  { code: "hi", title: "Hindi" },
  { code: "id", title: "Indonesian" },
  { code: "it", title: "Italian" },
  { code: "ja", title: "Japanese" },
  { code: "ko", title: "Korean" },
  { code: "pl", title: "Polish" },
  { code: "pt", title: "Portuguese" },
  { code: "ru", title: "Russian" },
  { code: "es", title: "Spanish" },
  { code: "th", title: "Thai" },
  { code: "tr", title: "Turkish" },
  { code: "uk", title: "Ukrainian" },
  { code: "vi", title: "Vietnamese" },
];

/**
 * The message for a translated request that timed out. When a translation
 * language is missing, macOS asks in dictum to download it and the request
 * waits for that dialog.
 */
export function translationTimeoutMessage(targetCode: string): string {
  const target =
    TRANSLATION_TARGET_LANGUAGES.find(
      (language) => language.code === targetCode,
    )?.title ?? targetCode;
  return `Translation timed out. macOS may be missing the ${target} translation language or the language of the audio. Download both in System Settings > General > Language & Region > Translation Languages, then try again.`;
}
