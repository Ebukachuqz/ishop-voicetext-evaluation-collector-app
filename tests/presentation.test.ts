import {test} from "node:test";
import assert from "node:assert/strict";
import {checkedAnswers, languageNames, shoppingUpdates, friendlyTranscriptionError} from "../lib/presentation";
import type {CollectionRecord} from "../lib/types";

const catalogue = [{product_id:"P1",name:"Blue T-shirt",color:"blue",price_ngn:10000}, {product_id:"P2",name:"Black T-shirt",color:"black",price_ngn:15000}];
test("basket changes are readable without product IDs or raw request codes", () => {
  const messages = shoppingUpdates({request_id:"r1", actions:[{action:"add_to_cart",product_id:"P1",quantity:1},{action:"add_to_cart",product_id:"P2",quantity:2}]},catalogue);
  assert.deepEqual(messages,["Add 1 Blue T-shirt to the basket","Add 2 Black T-shirts to the basket"]);
  assert.ok(!messages.join(" ").includes("r1"));
  assert.deepEqual(shoppingUpdates({action:"set_cart_quantity",product_id:"P1",quantity:0},catalogue),["Remove the Blue T-shirt"]);
});
test("unknown records never display their raw machine fields", () => {
  assert.deepEqual(shoppingUpdates({request_id:"private-value",product_id:"unknown",token:"do-not-display"},catalogue),["An earlier basket change"]);
  assert.equal(languageNames.en_pcm,"English and Pidgin mixed");
  assert.ok(!friendlyTranscriptionError("provider_pending").includes("file_id"));
});
test("navbar counts checked nonempty answers, not unfinished or flagged drafts", () => {
  const records = [{turns:{a:{verified:true,unresolved:false,editedTranscript:"My words"},b:{verified:false,editedTranscript:"Draft"},c:{verified:true,unresolved:true,editedTranscript:"Unsure"},d:{verified:true,editedTranscript:" "}}}] as unknown as CollectionRecord[];
  assert.equal(checkedAnswers(records),1);
});
