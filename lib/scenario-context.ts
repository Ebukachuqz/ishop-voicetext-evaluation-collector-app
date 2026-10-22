import type { Language, Localized } from "./types";

export type ScenarioContext = {
  kind: "product-description" | "practice-example" | "product-comparison";
  title: Localized;
  explanation: Localized;
  quotedText?: string;
};

const description: ScenarioContext = {
  kind: "product-description",
  title: {en:"Product description you are reading",pcm:"Product description wey you dey read",en_pcm:"Product description you dey read"},
  explanation: {
    en:"Imagine that the Blue T-shirt's product page contains the sentence below. You have noticed it while browsing. Use the answer instructions below to tell Drake about it in your own words.",
    pcm:"Imagine say you see di sentence below for Blue T-shirt product page as you dey check di shop. Read di instructions for your answers below, then tell Drake wetin you mean with your own words.",
    en_pcm:"Imagine say the Blue T-shirt product page contains the sentence below. You notice am while browsing. Read the answer instructions below and tell Drake in your own words."
  },
  quotedText: "Add one blue T-shirt to the cart."
};
const example: ScenarioContext = {
  kind:"practice-example",
  title:{en:"An example you are discussing",pcm:"Example wey una dey discuss",en_pcm:"An example you dey discuss"},
  explanation:{
    en:"You want to understand how Drake handles a basket request. The imaginary example is a shopper asking for one blue T-shirt to be added. Keep that example in mind, then follow each answer's instructions about whether you are discussing it or making a real request.",
    pcm:"You wan understand how Drake dey handle basket request. Di example na person wey ask make dem add one blue T-shirt. Na example una first dey discuss. Read each answer instruction to know wetin you wan tell Drake next.",
    en_pcm:"You want to understand how Drake handles basket requests. The imagined example na a shopper asking for one blue T-shirt to be added. Keep that example in mind and follow each answer's instructions about discussion or a real request."
  }
};
const comparison: ScenarioContext = {
  kind:"product-comparison",
  title:{en:"The two shirts in this conversation",pcm:"Di two shirts wey una dey talk about",en_pcm:"The two shirts for this conversation"},
  explanation:{
    en:"For this conversation, you are comparing the Blue T-shirt (₦10,000 each) and the Black T-shirt (₦15,000 each). Both are available. The other products remain in the shop, but these are the two colours mentioned in your answer instructions. Read those instructions before choosing what to say.",
    pcm:"For this conversation, na Blue T-shirt (₦10,000 each) and Black T-shirt (₦15,000 each) you dey compare. Di two dey available. Other products still dey shop, but na blue and black di answer instructions dey talk about. Read am before you talk.",
    en_pcm:"For this conversation, you dey compare the Blue T-shirt (₦10,000 each) and Black T-shirt (₦15,000 each). Both dey available. Other products still dey shop; these are the two colours mentioned in your answer instructions. Read am before you talk."
  }
};
export function scenarioContext(id: string): ScenarioContext | undefined {
  if (["F27","F28"].includes(id)) return description;
  if (["F29","F30"].includes(id)) return example;
  if (["F19","F20","F35","F36"].includes(id)) return comparison;
}
export function contextForLanguage(id: string, language: Language) {
  const context = scenarioContext(id);
  return context ? {kind:context.kind,title:context.title[language],explanation:context.explanation[language],quotedText:context.quotedText} : null;
}
