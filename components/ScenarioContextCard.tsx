import { contextForLanguage } from "@/lib/scenario-context";
import type { Language } from "@/lib/types";

export default function ScenarioContextCard({scenarioId,language}:{scenarioId:string;language:Language}) {
  const context = contextForLanguage(scenarioId,language);
  if (!context) return null;
  return <aside className="scenario-context-card" aria-label={context.title}>
    <span className="context-card-symbol" aria-hidden="true">{context.kind === "product-description" ? "📄" : context.kind === "practice-example" ? "💬" : "👕"}</span>
    <div><h3>{context.title}</h3><p>{context.explanation}</p>
      {context.quotedText && <blockquote>{context.quotedText}</blockquote>}
    </div>
  </aside>;
}
