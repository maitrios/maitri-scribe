import { getPreferenceValues } from "@vicinae/api";
import { useMemo, type ReactElement } from "react";
import { ResultView } from "./components/ResultView";
import { promptOptions, readCommonPrefs, readModelPref } from "./lib/preferences";
import { getBuiltInPrompt, loadPromptFile } from "./lib/prompts";

export default function FixGrammar(): ReactElement {
  const { spec, model, prefs } = useMemo(() => {
    const raw = getPreferenceValues<Preferences.FixGrammar>();
    const common = readCommonPrefs();
    return {
      spec: getBuiltInPrompt("fix-grammar", promptOptions(common, loadPromptFile(raw.promptFile))),
      model: readModelPref(raw.model),
      prefs: common,
    };
  }, []);
  return <ResultView commandId="fix-grammar" spec={spec} modelPref={model} prefs={prefs} />;
}
