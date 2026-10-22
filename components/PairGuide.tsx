import type { Scenario } from "@/lib/types";
import { pairedStory, storyFocus } from "@/lib/pair-guidance";

export default function PairGuide({ scenario, scenarios }: { scenario: Scenario; scenarios: Scenario[] }) {
  const other = pairedStory(scenario, scenarios);
  if (!other || !storyFocus[scenario.id]) return null;
  const stateComparison = scenario.context_group === "FB17";
  return <aside className="pair-guide" aria-label="What makes this story different">
    <h3>{stateComparison ? "Same question, different basket" : "Similar beginning, different decision"}</h3>
    <p>{stateComparison
      ? "These two stories intentionally use the same questions. Look carefully at the basket and earlier changes above; you do not need to invent different wording."
      : "The first answer may resemble another story. Read the second answer carefully: your final decision is different. Use your own words for this story."}</p>
    <div className="pair-guide-cards">
      <section className="pair-guide-current"><strong>This story · {Number(scenario.id.slice(1))}</strong><p>{storyFocus[scenario.id]}</p></section>
      <section><strong>The related story · {Number(other.id.slice(1))}</strong><p>{storyFocus[other.id]}</p></section>
    </div>
    <small>These notes describe the situation. Record your own wording in the language you selected.</small>
  </aside>;
}
