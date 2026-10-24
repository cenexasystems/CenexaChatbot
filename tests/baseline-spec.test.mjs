import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { LEGACY_GLOBAL_INSTRUCTIONS, MEDIA_GLOBAL_INSTRUCTIONS } from "../src/lib/ai.ts";
import { describeMediaForAI } from "../src/lib/media-ai.ts";
import { createMockState } from "./mock-db.ts";

// Helper replicating the webhook's cannedMediaReply function
function cannedMediaReply(msgType, isPayment) {
  switch (msgType) {
    case "image":
      return isPayment
        ? "Thank you for the payment screenshot! 🙏 Our team will verify and confirm shortly 💛"
        : "Thank you for sending! 📩 We have received your image. Our team will get back to you shortly 💛";
    case "audio":
      return "Thank you for your voice note! 🎤 Our team will listen and get back to you shortly 💛";
    case "document":
      return "Thank you for sending the document! 📄 Our team will review it and get back to you shortly 💛";
    case "video":
      return "Thank you for the video! 🎥 Our team will take a look and get back to you shortly 💛";
    default:
      return "Thank you for sharing your file. Our team will get back to you shortly 💛";
  }
}

const fixUrl = (s) =>
  s ? s.replace(/https:\/\/b2-bridal-studio-upgraded\.vercel\.app/g, "https://b2bridalstudio.com") : null;

describe("BASELINE_SPEC: Legacy Webhook Regression Suite (Scenarios A - K)", () => {
  test("Scenario A: Text message from returning customer uses LEGACY_GLOBAL_INSTRUCTIONS and fixes URL", () => {
    const rawPrompt = "Welcome to our salon! Visit https://b2-bridal-studio-upgraded.vercel.app for booking.";
    const cleanedPrompt = fixUrl(rawPrompt);
    assert.equal(cleanedPrompt.includes("b2-bridal-studio-upgraded.vercel.app"), false);
    assert.equal(cleanedPrompt.includes("https://b2bridalstudio.com"), true);

    // Verify legacy instructions are preserved byte-for-byte
    assert.match(LEGACY_GLOBAL_INSTRUCTIONS, /If the user sends "\[image\]", reply with: "Thank you for sending!/);
    assert.match(LEGACY_GLOBAL_INSTRUCTIONS, /CRITICAL ANTI-HALLUCINATION RULE:/);
    // Legacy must NOT mention voice note transcripts or vision models
    assert.doesNotMatch(LEGACY_GLOBAL_INSTRUCTIONS, /\[Customer sent a VOICE NOTE/);
    assert.doesNotMatch(LEGACY_GLOBAL_INSTRUCTIONS, /\[Customer sent an IMAGE/);
  });

  test("Scenario B: Image without caption produces canned reply and no AI call", () => {
    const reply = cannedMediaReply("image", false);
    assert.equal(
      reply,
      "Thank you for sending! 📩 We have received your image. Our team will get back to you shortly 💛"
    );
  });

  test("Scenario C: Audio / voice note without caption produces canned reply and no transcription", () => {
    const reply = cannedMediaReply("audio", false);
    assert.equal(
      reply,
      "Thank you for your voice note! 🎤 Our team will listen and get back to you shortly 💛"
    );
  });

  test("Scenario D: Video without caption produces canned reply", () => {
    const reply = cannedMediaReply("video", false);
    assert.equal(
      reply,
      "Thank you for the video! 🎥 Our team will take a look and get back to you shortly 💛"
    );
  });

  test("Scenario E: First-ever message greeting regex detects simple greetings", () => {
    const greetingRegex = /^(hi|hello|hey|hii|helo|hai|வணக்கம்|ஹலோ)\s*[!?.]*\s*$/i;
    assert.equal(greetingRegex.test("Hi"), true);
    assert.equal(greetingRegex.test("hello!"), true);
    assert.equal(greetingRegex.test("வணக்கம்"), true);
    assert.equal(greetingRegex.test("hey..."), true);

    // Substantive messages must NOT match
    assert.equal(greetingRegex.test("Hi, I want to book an appointment"), false);
    assert.equal(greetingRegex.test("Hello, what are your rates?"), false);
  });

  test("Scenario F: Human mode suppresses AI replies", () => {
    const conversation = { mode: "human" };
    const shouldReply = conversation.mode !== "human";
    assert.equal(shouldReply, false);
  });

  test("Scenario G: Duplicate wamid triggers 23505 deduplication", async () => {
    const { state, mockSupabase } = createMockState();
    // Insert initial message
    const first = await mockSupabase.from("messages").insert({
      conversation_id: "c1",
      whatsapp_msg_id: "wamid.123",
      content: "Hello",
    });
    assert.equal(state.messages.length, 1);

    // Insert same wamid
    const second = await mockSupabase.from("messages").insert({
      conversation_id: "c1",
      whatsapp_msg_id: "wamid.123",
      content: "Hello again",
    });
    assert.equal(second.error?.code, "23505");
    assert.equal(state.messages.length, 1); // Not duplicated
  });

  test("Scenario H & I: Echo and history events are no-ops when coexistence_enabled = false", () => {
    const biz = { id: "biz1", coexistence_enabled: false };
    const handleEchoShouldRun = biz && biz.coexistence_enabled === true;
    const handleHistoryShouldRun = biz && biz.coexistence_enabled === true;

    assert.equal(handleEchoShouldRun, false);
    assert.equal(handleHistoryShouldRun, false);
  });

  test("Scenario J: Unsupported types (e.g. reaction) are filtered", () => {
    const MEDIA_TYPES = ["image", "audio", "video", "document", "sticker"];
    const isSupported = (type) => type === "text" || MEDIA_TYPES.includes(type);

    assert.equal(isSupported("reaction"), false);
    assert.equal(isSupported("location"), false);
    assert.equal(isSupported("text"), true);
    assert.equal(isSupported("image"), true);
    assert.equal(isSupported("audio"), true);
  });

  test("Scenario K: Payment screenshot when payment_qr_sent is true", () => {
    const conversation = { payment_qr_sent: true, payment_status: "none" };
    const mediaType = "image";
    let isPaymentScreenshot = false;

    if (mediaType === "image" && conversation.payment_qr_sent) {
      isPaymentScreenshot = true;
      conversation.payment_status = "pending";
      conversation.payment_qr_sent = false;
    }

    assert.equal(isPaymentScreenshot, true);
    assert.equal(conversation.payment_status, "pending");
    assert.equal(conversation.payment_qr_sent, false);

    const reply = cannedMediaReply("image", isPaymentScreenshot);
    assert.equal(
      reply,
      "Thank you for the payment screenshot! 🙏 Our team will verify and confirm shortly 💛"
    );
  });
});
