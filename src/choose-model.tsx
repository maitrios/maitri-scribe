import { useMemo, type ReactElement } from "react";
import { ModelPicker } from "./components/ModelPicker";
import { providerConfig, readCommonPrefs } from "./lib/preferences";

export default function ChooseModel(): ReactElement {
  const config = useMemo(() => providerConfig(readCommonPrefs()), []);
  return <ModelPicker config={config} />;
}
