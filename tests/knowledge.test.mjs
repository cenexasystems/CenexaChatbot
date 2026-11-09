import { test } from "node:test";
import assert from "node:assert/strict";
import { knowledgeSearchTerms, splitKnowledgeText } from "../src/lib/knowledge.ts";

test("knowledge files split into overlapping searchable sections", () => {
  const source = `${"Service price ₹500 for bridal makeup.\n".repeat(100)}`;
  const chunks = splitKnowledgeText(source);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 1400));
  assert.ok(chunks.join(" ").includes("bridal makeup"));
});

test("knowledge search terms keep unique English and Tamil words", () => {
  assert.deepEqual(knowledgeSearchTerms("Bridal bridal makeup மணப்பெண் ₹500"), ["bridal", "makeup", "மணப்பெண்", "500"]);
});
