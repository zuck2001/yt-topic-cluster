"use client";

import { useMemo, useState } from "react";

type Video = {
  id: number;
  videoId: string;
  title: string;
  description?: string | null;
  publishedAt: string;
  createdAt: string;
  topicLabel: string | null;
  channelId: number;
};

type ChannelInfo = {
  id: number;
  url: string;
  themeSummary?: string | null;
};

type Group = {
  label: string;
  videos: Video[];
  channels?: ChannelInfo[];
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000/api";

export default function Home() {
  const [urls, setUrls] = useState<string[]>(["", "", ""]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const hasGroups = groups.length > 0;

  const handleUrlChange = (idx: number, value: string) => {
    setUrls((prev) => prev.map((u, i) => (i === idx ? value : u)));
  };

  const submit = async () => {
    const trimmed = urls.map((u) => u.trim());
    if (trimmed.filter(Boolean).length !== 3) {
      setError("Please provide exactly 3 YouTube channel URLs.");
      setSuccess(null);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiBase}/videos/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: trimmed }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        const message =
          (data && (data.message || data.error)) ||
          "Failed to ingest channels.";
        throw new Error(message);
      }
      setGroups(data as Group[]);
      setSuccess("Videos ingested and grouped.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiBase}/videos/groups`);
      const data = await safeJson(res);
      if (!res.ok) {
        const message =
          (data && (data.message || data.error)) || "Failed to load groups.";
        throw new Error(message);
      }
      setGroups(data as Group[]);
      setSuccess("Loaded existing grouped videos.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const total = groups.reduce((acc, g) => acc + g.videos.length, 0);
    const topics = groups.length;
    return { total, topics };
  }, [groups]);

  const channels = useMemo(() => {
    const list: ChannelInfo[] = [];
    const seen = new Set<number>();
    for (const g of groups) {
      if (!g.channels) continue;
      for (const ch of g.channels) {
        if (seen.has(ch.id)) continue;
        seen.add(ch.id);
        list.push(ch);
      }
    }
    return list;
  }, [groups]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-8">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-blue-600">YT Topic Cluster</p>
          <h1 className="text-3xl font-bold tracking-tight">
            Group YouTube channels by topic
          </h1>
          <p className="text-sm text-slate-600">
            Enter three channel URLs, we’ll fetch their videos, cluster similar
            topics, and show anything unmatched under “No Match”.
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
              1) Paste three channel URLs (e.g., https://www.youtube.com/@handle)
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
              2) Click Ingest & Group
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
              3) Refresh groups anytime
            </span>
          </div>
        </header>

        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-3 md:grid-cols-3 md:gap-4">
            {urls.map((url, idx) => (
              <div key={idx} className="grid gap-2">
                <label className="text-sm font-medium text-slate-700">
                  Channel URL {idx + 1}
                </label>
                <input
                  value={url}
                  onChange={(e) => handleUrlChange(idx, e.target.value)}
                  placeholder="https://www.youtube.com/@channel"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={submit}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {loading ? "Working..." : "Ingest & Group"}
            </button>
            <button
              onClick={fetchGroups}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Refresh Saved Groups
            </button>
            <span className="text-xs text-slate-500">
              Backend: <code className="rounded bg-slate-100 px-1"> {apiBase}</code>
            </span>
          </div>

          {(error || success) && (
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                error
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-green-50 text-green-700 border border-green-200"
              }`}
            >
              {error || success}
            </div>
          )}
        </section>

        <section className="grid gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Grouped videos</h2>
              <p className="text-sm text-slate-600">
                {hasGroups
                  ? `${summary.total} videos across ${summary.topics} topic groups.`
                  : "No groups yet. Ingest channels or refresh existing groups."}
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            {groups.map((group) => (
              <div
                key={group.label}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-1 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      {group.label}
                    </span>
                    <span className="text-xs text-slate-500">
                      {group.videos.length} video
                      {group.videos.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {group.channels && group.channels.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      {group.channels.map((ch) => (
                        <span
                          key={ch.id}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-[2px]"
                        >
                          <span className="font-semibold text-slate-700">
                            #{ch.id}
                          </span>
                          <span className="text-slate-600">
                            {ch.themeSummary || "No theme"}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {group.videos.map((video) => (
                    <article
                      key={video.id}
                      className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold leading-tight text-slate-900">
                          {video.title}
                        </p>
                        <span className="text-[11px] text-slate-500">
                          #{video.channelId}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Published{" "}
                        {new Date(video.publishedAt).toLocaleDateString()} · ID:{" "}
                        <code className="bg-white px-1 py-[1px] text-[11px]">
                          {video.videoId}
                        </code>
                      </p>
                      {video.topicLabel && (
                        <span className="w-fit rounded-full bg-white px-2 py-[2px] text-[11px] font-semibold text-slate-700">
                          {video.topicLabel}
                        </span>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            ))}

            {!hasGroups && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                Ingest three channels to see grouped results here.
              </div>
            )}
          </div>
        </section>

        {channels.length > 0 && (
          <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Channel themes</h2>
                <p className="text-sm text-slate-600">
                  Inferred top keywords per channel.
                </p>
              </div>
              <span className="text-xs text-slate-500">
                {channels.length} channel{channels.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {channels.map((ch) => (
                <div
                  key={ch.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">
                      Channel #{ch.id}
                    </span>
                    <a
                      href={ch.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-blue-600 underline"
                    >
                      open
                    </a>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 break-all">{ch.url}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Theme:{" "}
                    <span className="font-semibold text-slate-800">
                      {ch.themeSummary || "No theme"}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

async function safeJson(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `Unexpected response from server. Status ${res.status}. ${text.slice(0, 120)}`,
    );
  }
  return res.json();
}
