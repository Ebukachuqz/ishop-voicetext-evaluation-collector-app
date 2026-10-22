import type { Scenario } from "./types";

// Situation summaries for contributors; these are not sentences to record.
export const storyFocus: Record<string, string> = {
  F01: "You are still deciding. You want Drake to wait before adding anything.",
  F02: "You have decided. You want one blue shirt added now.",
  F03: "You only want to know whether any shirt costs below ₦8,000.",
  F04: "You only want to know whether any shirt costs below ₦12,000.",
  F05: "You want one blue shirt added only if it costs below ₦8,000.",
  F06: "You want one blue shirt added only if it costs below ₦12,000.",
  F07: "You change your colour choice, then settle on one black shirt to add now.",
  F08: "You change your colour choice, then decide to wait. Nothing should be added yet.",
  F09: "You already have one blue shirt. You want one extra, making two altogether.",
  F10: "You already have one blue shirt. You only want to check the earlier addition, without ordering another.",
  F11: "There are three blue shirts in your basket. You want two altogether.",
  F12: "There are three blue shirts in your basket. You want two extra, making five altogether.",
  F13: "You only want the price of two blue shirts. Keep the three already in your basket.",
  F14: "You have finished comparing prices. You now want the basket reduced from three blue shirts to two.",
  F15: "Drake is waiting for your decision about two blue shirts. You now agree to the addition.",
  F16: "Drake is waiting for your decision about two blue shirts. You now reject the addition.",
  F17: "Neither shirt has been added. Cancel blue and go ahead with one black shirt only.",
  F18: "Neither shirt has been added. Cancel black and go ahead with one blue shirt only.",
  F19: "You want two of one shirt, but you have not identified which shirt. Leave its colour unspecified.",
  F20: "You realise your request is unclear, then identify black and ask for two black shirts.",
  F21: "You begin with two blue shirts, then correct the final quantity to one.",
  F22: "You begin with one blue shirt, then correct the final quantity to two.",
  F23: "You no longer want the pending addition. Cancel it completely.",
  F24: "You may still want the pending shirt later. Pause and wait for fresh permission.",
  F25: "Your yes confirms which shirt you mean when asking its price. You are not approving an addition.",
  F26: "Your yes approves Drake's offer to add one blue shirt now.",
  F27: "You want Drake to explain the sentence in the product description.",
  F28: "You now want the addition described in that sentence carried out as your own request.",
  F29: "You are discussing a made-up example and only want an explanation.",
  F30: "You have finished discussing the example. You now want one blue shirt added for real.",
  F31: "You only want to check whether the earlier blue-shirt addition happened.",
  F32: "The first blue shirt is already added. You now want another, making two altogether.",
  F33: "The basket shows one blue shirt and a completed addition. Ask Drake to check the earlier addition.",
  F34: "The basket is empty and has no completed addition, although Drake says it was added. Ask Drake to check.",
  F35: "Choose one blue shirt to add now. The black shirt is still only under discussion.",
  F36: "Choose one black shirt to add now. The blue shirt is still only under discussion.",
  F37: "Cancel your own pending shirt and request one for your cousin, without choosing their shirt colour.",
  F38: "Cancel your own pending blue shirt and choose one black shirt for your cousin instead.",
  F39: "Remove one blue shirt. Leave two blue shirts and both black shirts in the basket.",
  F40: "Only ask the price of two blue shirts. Keep all three blue shirts and both black shirts in the basket."
};

export function pairedStory(scenario: Scenario, scenarios: Scenario[]) {
  return scenarios.find(other => other.id !== scenario.id && other.context_group === scenario.context_group);
}
