import { closeMainWindow, getApplications, open } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { dictumBundleIds } from "./api";

export default async function Command() {
  const installed = new Set(
    (await getApplications()).map((application) => application.bundleId),
  );
  const bundleId = dictumBundleIds().find((id) => installed.has(id));
  if (!bundleId) {
    await showFailureToast("Install dictum first.", {
      title: "dictum not found",
    });
    return;
  }
  await closeMainWindow();
  await open("dictum://main", bundleId);
}
