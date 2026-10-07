import { Clipboard, closeMainWindow, PopToRootType, showHUD } from "@vicinae/api";

// Action.Paste fires closeMainWindow and Clipboard.paste without awaiting, which races on Hyprland; copying first also keeps the paste pipe from timing out.
export async function pasteAndClose(text: string): Promise<void> {
  await Clipboard.copy(text);
  await closeMainWindow({ popToRootType: PopToRootType.Immediate });
  await Clipboard.paste(text);
}

export async function copyAndClose(text: string, hud = "Copied to clipboard"): Promise<void> {
  await Clipboard.copy(text);
  await showHUD(hud, { popToRootType: PopToRootType.Immediate });
}
