"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, Panel, cx } from "@/components/cx/ui";
import { Icon } from "@/components/cx/icons";

type AssistantSettings = {
  system_prompt: string | null;
  welcome_message: string | null;
  handoff_rules: string | null;
  handoff_keywords: string[];
  greeting_phrases: string[];
  url_rewrite_from: string | null;
  url_rewrite_to: string | null;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

const EMPTY_SETTINGS: AssistantSettings = {
  system_prompt: "",
  welcome_message: "",
  handoff_rules: "",
  handoff_keywords: [],
  greeting_phrases: [],
  url_rewrite_from: "",
  url_rewrite_to: "",
};

const INPUT = "w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/20";
const LABEL = "eyebrow !text-[9.5px] block mb-1.5";

function lines(values: string[]): string {
  return values.join("\n");
}

function parseLines(value: string): string[] {
  return [...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
}

export function AssistantStudio() {
  const [settings, setSettings] = useState<AssistantSettings>(EMPTY_SETTINGS);
  const [handoffKeywords, setHandoffKeywords] = useState("");
  const [greetingPhrases, setGreetingPhrases] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [testInput, setTestInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [testError, setTestError] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/assistant/settings")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load assistant settings.");
        return data;
      })
      .then((data) => {
        if (!live) return;
        const next = { ...EMPTY_SETTINGS, ...data.settings } as AssistantSettings;
        setSettings(next);
        setHandoffKeywords(lines(next.handoff_keywords ?? []));
        setGreetingPhrases(lines(next.greeting_phrases ?? []));
      })
      .catch((err) => live && setError(err instanceof Error ? err.message : "Could not load assistant settings."))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  function update<K extends keyof AssistantSettings>(key: K, value: AssistantSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setNotice("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const payload = {
      ...settings,
      handoff_keywords: parseLines(handoffKeywords),
      greeting_phrases: parseLines(greetingPhrases),
      url_rewrite_from: settings.url_rewrite_from?.trim() || null,
      url_rewrite_to: settings.url_rewrite_to?.trim() || null,
    };
    try {
      const response = await fetch("/api/assistant/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save assistant settings.");
      const next = { ...EMPTY_SETTINGS, ...data.settings } as AssistantSettings;
      setSettings(next);
      setHandoffKeywords(lines(next.handoff_keywords ?? []));
      setGreetingPhrases(lines(next.greeting_phrases ?? []));
      setNotice("Assistant settings saved. New WhatsApp messages will use them.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save assistant settings.");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = testInput.trim();
    if (!content || testing) return;
    const nextChat: ChatMessage[] = [...chat, { role: "user", content }];
    setChat(nextChat);
    setTestInput("");
    setTesting(true);
    setTestError("");
    try {
      const response = await fetch("/api/assistant/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextChat }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Test request failed.");
      setChat([...nextChat, { role: "assistant", content: data.reply }]);
      if (data.error) setTestError("The model request failed; this is the configured fallback reply.");
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Test request failed.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="mt-5 space-y-5">
      <form onSubmit={save} className="space-y-5">
        <Panel title="Instructions" icon="note" action={
          <Button variant="primary" size="sm" type="submit" disabled={saving || loading}>{saving ? "Saving…" : "Save"}</Button>
        }>
          {loading ? <p className="p-4 text-[13px] text-ink-faint">Loading assistant settings…</p> : (
            <div className="p-4 space-y-4">
              <label className="block">
                <span className={LABEL}>Instructions for your AI</span>
                <textarea
                  value={settings.system_prompt ?? ""}
                  onChange={(event) => update("system_prompt", event.currentTarget.value)}
                  maxLength={12000}
                  rows={13}
                  placeholder="Describe your business, services, prices, tone, hours, and the answers your assistant should give."
                  className={cx(INPUT, "resize-y min-h-[220px] leading-relaxed")}
                />
                <span className="block text-right text-[10.5px] text-ink-faint mt-1">{(settings.system_prompt ?? "").length.toLocaleString()} / 12,000</span>
              </label>
              <label className="block">
                <span className={LABEL}>First reply to a new customer</span>
                <textarea
                  value={settings.welcome_message ?? ""}
                  onChange={(event) => update("welcome_message", event.currentTarget.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Leave blank to let the AI write a greeting using your instructions."
                  className={cx(INPUT, "resize-y min-h-[84px] leading-relaxed")}
                />
              </label>

              <section className="grid lg:grid-cols-2 gap-4 border-t border-line pt-4">
                <label className="block">
                  <span className={LABEL}>When to hand the chat to a person</span>
                  <textarea
                    value={settings.handoff_rules ?? ""}
                    onChange={(event) => update("handoff_rules", event.currentTarget.value)}
                    maxLength={4000}
                    rows={5}
                    placeholder="Example: Hand off refund requests, complaints about a missed appointment, and medical questions."
                    className={cx(INPUT, "resize-y leading-relaxed")}
                  />
                </label>
                <label className="block">
                  <span className={LABEL}>Extra hand-off phrases</span>
                  <textarea
                    value={handoffKeywords}
                    onChange={(event) => { setHandoffKeywords(event.currentTarget.value); setNotice(""); }}
                    rows={5}
                    placeholder={"One phrase per line\nExample: refund please"}
                    className={cx(INPUT, "resize-y leading-relaxed")}
                  />
                  <span className="block text-[10.5px] text-ink-faint mt-1">Direct requests for a person are always handed off automatically.</span>
                </label>
              </section>

              <section className="grid lg:grid-cols-2 gap-4 border-t border-line pt-4">
                <label className="block">
                  <span className={LABEL}>First-message greetings</span>
                  <textarea
                    value={greetingPhrases}
                    onChange={(event) => { setGreetingPhrases(event.currentTarget.value); setNotice(""); }}
                    rows={4}
                    placeholder={"One exact greeting per line\nhi\nhello\nவணக்கம்"}
                    className={cx(INPUT, "resize-y leading-relaxed")}
                  />
                  <span className="block text-[10.5px] text-ink-faint mt-1">A matching first message receives the welcome reply without a second AI response.</span>
                </label>
                <div className="grid gap-3 content-start">
                  <label className="block">
                    <span className={LABEL}>Replace URL</span>
                    <input value={settings.url_rewrite_from ?? ""} onChange={(event) => update("url_rewrite_from", event.currentTarget.value)} placeholder="https://old.example.com" className={INPUT} />
                  </label>
                  <label className="block">
                    <span className={LABEL}>With URL</span>
                    <input value={settings.url_rewrite_to ?? ""} onChange={(event) => update("url_rewrite_to", event.currentTarget.value)} placeholder="https://yourbusiness.in" className={INPUT} />
                  </label>
                  <p className="text-[10.5px] text-ink-faint">Optional. Rewrites this exact URL in saved instructions and the welcome message for this business only.</p>
                </div>
              </section>

              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <Button variant="primary" type="submit" disabled={saving || loading}>{saving ? "Saving…" : "Save assistant settings"}</Button>
                {notice && <span role="status" className="text-[12px] text-emerald-700">{notice}</span>}
                {error && <span role="alert" className="text-[12px] text-danger">{error}</span>}
              </div>
            </div>
          )}
        </Panel>
      </form>

      <Panel title="Knowledge files" icon="file" meta={<span className="eyebrow !text-[9px]">Coming later</span>}>
        <div className="p-4 flex items-start gap-3">
          <Icon name="upload" size={18} className="text-ink-faint mt-0.5" />
          <div><p className="text-[13px] font-semibold">Add a price list or brochure</p><p className="text-[12px] text-ink-faint mt-1">File search is not connected yet. The test chat currently uses the saved instructions above.</p></div>
        </div>
      </Panel>

      <Panel title="Test chat" icon="assistant" meta={<span className="eyebrow !text-[9px]">Uses saved settings</span>} action={chat.length > 0 ? <Button size="sm" onClick={() => { setChat([]); setTestError(""); }}>Clear</Button> : undefined}>
        <div className="p-4">
          <div className="min-h-[180px] max-h-[360px] overflow-y-auto rounded-[12px] border border-line bg-canvas p-3 space-y-3" aria-live="polite">
            {chat.length === 0 && <p className="text-[12.5px] text-ink-faint py-8 text-center">Try a customer question in English, Tamil, or Tanglish.</p>}
            {chat.map((message, index) => (
              <div key={`${index}-${message.role}`} className={cx("max-w-[88%] rounded-[12px] px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap", message.role === "user" ? "ml-auto bg-brand text-white" : "bg-surface border border-line text-ink")}>
                {message.content}
              </div>
            ))}
            {testing && <p className="text-[11px] text-ink-faint">Assistant is thinking…</p>}
          </div>
          <form onSubmit={sendTest} className="flex items-end gap-2 mt-3">
            <textarea value={testInput} onChange={(event) => setTestInput(event.currentTarget.value)} maxLength={2000} rows={2} placeholder="Ask a test question…" className={cx(INPUT, "resize-none min-h-[44px] max-h-28")} />
            <Button variant="primary" icon="send" type="submit" disabled={testing || !testInput.trim()} aria-label="Send test message">Test</Button>
          </form>
          {testError && <p role="status" className="text-[11px] text-attention mt-2">{testError}</p>}
          <p className="text-[10.5px] text-ink-faint mt-2">Test messages go to your configured AI provider. They are not sent to WhatsApp customers.</p>
        </div>
      </Panel>
    </div>
  );
}
