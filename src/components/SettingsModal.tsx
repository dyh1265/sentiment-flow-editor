"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PROVIDERS,
  clearProviderKey,
  loadProviderSettings,
  loadSettings,
  saveSettings,
  type Provider,
} from "@/lib/client/apiKey";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function SettingsModal({ open, onClose, onSaved }: SettingsModalProps) {
  const [provider, setProvider] = useState<Provider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [reveal, setReveal] = useState(false);
  // Tracks which providers currently have a saved key so we can show dots in
  // the dropdown without re-rendering the whole modal. Derived from PROVIDERS
  // so adding a new provider to the registry automatically extends the shape.
  const [savedFor, setSavedFor] = useState<Record<Provider, boolean>>(
    () =>
      (Object.keys(PROVIDERS) as Provider[]).reduce(
        (acc, p) => {
          acc[p] = false;
          return acc;
        },
        {} as Record<Provider, boolean>,
      ),
  );

  const cfg = PROVIDERS[provider];

  // Rehydrate when the modal opens: pick up whichever provider is active,
  // and its saved key + model.
  useEffect(() => {
    if (!open) return;
    const active = loadSettings();
    setProvider(active.provider);
    setApiKey(active.apiKey ?? "");
    setModel(active.model);
    setBaseURL(active.provider === "custom" ? (active.baseURL ?? "") : "");
    setReveal(false);
    setSavedFor(
      (Object.keys(PROVIDERS) as Provider[]).reduce(
        (acc, p) => {
          acc[p] = Boolean(loadProviderSettings(p).apiKey);
          return acc;
        },
        {} as Record<Provider, boolean>,
      ),
    );
  }, [open]);

  // When the user picks a different provider from the dropdown, swap in that
  // provider's saved key + model (or defaults).
  const onChangeProvider = (next: Provider) => {
    setProvider(next);
    const p = loadProviderSettings(next);
    setApiKey(p.apiKey ?? "");
    setModel(p.model);
    setBaseURL(next === "custom" ? (p.baseURL ?? "") : "");
    setReveal(false);
  };

  const datalistId = useMemo(() => `models-${provider}`, [provider]);

  if (!open) return null;

  const handleSave = () => {
    saveSettings({
      provider,
      apiKey: apiKey.trim() || null,
      model: model.trim() || cfg.defaultModel,
      baseURL: provider === "custom" ? baseURL.trim() || null : null,
    });
    setSavedFor((prev) => ({ ...prev, [provider]: Boolean(apiKey.trim()) }));
    onSaved?.();
    onClose();
  };

  const handleClear = () => {
    clearProviderKey(provider);
    setApiKey("");
    setSavedFor((prev) => ({ ...prev, [provider]: false }));
    onSaved?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
            <p className="mt-1 text-xs text-gray-500">
              Your API key is stored in this browser only. It&apos;s sent directly to
              the provider&apos;s API for LLM features and never touches any other server.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-600">
              Provider
            </span>
            <select
              value={provider}
              onChange={(e) => onChangeProvider(e.target.value as Provider)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDERS[p].label}
                  {savedFor[p] ? " (key saved)" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">{cfg.costBlurb}</p>
          </label>

          {provider === "custom" ? (
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-600">
                Base URL
              </span>
              <input
                type="url"
                value={baseURL}
                onChange={(e) => setBaseURL(e.target.value)}
                placeholder="https://openrouter.ai/api/v1"
                spellCheck={false}
                autoComplete="off"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Any OpenAI-compatible endpoint. Examples:{" "}
                <code>https://openrouter.ai/api/v1</code>,{" "}
                <code>https://api.together.xyz/v1</code>,{" "}
                <code>https://api.mistral.ai/v1</code>,{" "}
                <code>http://localhost:11434/v1</code> (Ollama).
              </p>
            </label>
          ) : null}

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-600">
              {cfg.label} API key
            </span>
            <div className="mt-1 flex gap-2">
              <input
                type={reveal ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  provider === "openai"
                    ? "sk-..."
                    : provider === "groq"
                      ? "gsk_..."
                      : provider === "gemini"
                        ? "AIza..."
                        : provider === "openrouter"
                          ? "sk-or-..."
                          : "your provider API key"
                }
                autoComplete="off"
                spellCheck={false}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                className="rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
              >
                {reveal ? "Hide" : "Show"}
              </button>
            </div>
            {provider !== "custom" ? (
              <p className="mt-1 text-xs text-gray-500">
                Get a key at{" "}
                <a
                  href={cfg.signupUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-blue-600 underline"
                >
                  {cfg.signupUrl.replace(/^https?:\/\//, "")}
                </a>
                .
              </p>
            ) : null}
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-600">
              Model
            </span>
            <input
              type="text"
              list={datalistId}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={cfg.defaultModel}
              spellCheck={false}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <datalist id={datalistId}>
              {cfg.modelOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-gray-500">
              Pick from the suggestions or paste any model id the provider supports.
              Used for High-accuracy scoring, Suggest rewrites, and Fix grammar.
            </p>
          </label>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-medium">Security note</p>
            <p className="mt-1">
              The key lives in localStorage on this device. Anyone with access to this
              browser (or a browser extension that can read localStorage) can read it.
              Use a key that&apos;s scoped or rotated for this tool, and remove it from
              your provider account when you&apos;re done.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-gray-600 underline hover:text-gray-800"
          >
            Clear saved key for {cfg.label}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
