import { shoppingUpdates } from "@/lib/presentation";
import type { Scenario, ScenarioPacket } from "@/lib/types";

export default function ShoppingUpdates({state, catalogue}: {state: Scenario["initial_state"]; catalogue: ScenarioPacket["catalogue"]}) {
  return <section className="shopping-updates" aria-label="What has happened with your basket">
    <h3>What has happened so far?</h3>
    {!!state.pending && <div className="update-card waiting"><span className="update-symbol" aria-hidden="true">◷</span><div><strong>Waiting to be done</strong><ul>{shoppingUpdates(state.pending, catalogue).map((text, i) => <li key={i}>{text}</li>)}</ul><small>This has not changed your basket yet.</small></div></div>}
    {state.receipts.map((receipt, i) => <div className="update-card finished" key={i}><span className="update-symbol" aria-hidden="true">✓</span><div><strong>Already done</strong><ul>{shoppingUpdates(receipt, catalogue).map((text, j) => <li key={j}>{text.replace(/^Add /, "Added ").replace(/^Remove /, "Removed ")}</li>)}</ul><small>This earlier change is confirmed.</small></div></div>)}
    {!state.pending && !state.receipts.length && <p className="no-updates">No earlier basket change has been confirmed.</p>}
  </section>;
}
