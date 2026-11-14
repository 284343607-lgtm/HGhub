import { useEffect, useMemo, useRef, useState } from "react";
import type { Episode, MediaDetail, MediaItem, Page } from "./protocol";
import { pluginCommand, pluginError, type InstalledPlugin } from "./client";
import { usePluginRequests } from "./usePluginRequests";
import { useHost, libraryKey, type LocalProgress } from "./HostContext";
import { Notice } from "./BrowsePages";
import ContentPlayer from "./ContentPlayer";
import CommentsPanel from "./CommentsPanel";
import MediaInteractions from "./MediaInteractions";
import { pluginProgressReporter } from "./progressReporter";

export default function FeedPage({ plugin, onBack, active, openMedia }: {
  plugin: InstalledPlugin; onBack: () => void; active: boolean; openMedia: (mediaId: string) => void;
}) {
  const request = usePluginRequests(), host = useHost(), epoch = useRef(0), lock = useRef(false);
  const [page, setPage] = useState<Page<MediaItem> | null>(null), [index, setIndex] = useState(0);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const failedCursor = useRef<string | undefined>(undefined), advanceAfterRetry = useRef(false);
  const load = async (cursor?: string, advance = false) => {
    if (lock.current) return;
    lock.current = true;
    const n = ++epoch.current; setBusy(true); setError("");
    failedCursor.current = cursor; advanceAfterRetry.current = advance;
    try {
      const result = await request<Page<MediaItem>>("call", { id: plugin.meta.id, method: "feed.list", args: { cursor, limit: 20 } });
      if (n !== epoch.current) return;
      const oldItems = cursor ? page?.items || [] : [], ids = new Set(oldItems.map(i => i.id));
      const added = result.items.filter(item => { if (ids.has(item.id)) return false; ids.add(item.id); return true; });
      setPage({ ...result, next: cursor && result.next === cursor ? null : result.next, items: [...oldItems, ...added] });
      if (!cursor) setIndex(0);
      else if (advance && added.length) setIndex(oldItems.length);
    } catch (e) {
      if (n === epoch.current && (e as { code?: string }).code !== "CANCELLED") setError(pluginError(e));
    } finally { if (n === epoch.current) { lock.current = false; setBusy(false); } }
  };
  useEffect(() => { void load(); return () => { epoch.current++; lock.current = false; request.cancelAll(); }; }, [plugin.meta.id, plugin.revision]);
  const next = () => {
    if (page && index + 1 < page.items.length) setIndex(index + 1);
    else if (page?.next) void load(page.next, true);
  };
  const previous = () => setIndex(i => Math.max(0, i - 1));
  useEffect(() => {
    if (!active) return;
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select,button,video,[contenteditable=true]")) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.key === "ArrowDown" ? next() : previous(); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [active, page, index]);
  const current = page?.items[index];
  return <div className="hpp-page hpp-feed-page">
    <header className="hpp-header"><div><h1>{plugin.meta.name} · 信息流</h1><p>↑ ↓ 切换内容</p></div><div className="hpp-header-tools"><button onClick={onBack}>返回</button></div></header>
    <div className="hpp-scroll"><div className="hpp-content">
      <Notice error={error}/>{error && <button disabled={busy} onClick={() => void load(failedCursor.current, advanceAfterRetry.current)}>重试信息流</button>}
      {current ? <FeedEntry key={current.id} plugin={plugin} item={current} active={active} onEnded={() => { if (host.prefs.autoNext) next(); }} openMedia={openMedia}/>
        : <div className="hpp-empty">{busy ? "正在读取信息流…" : "暂无信息流"}</div>}
    </div></div>
    <nav className="hpp-feed-navigation" aria-label="信息流导航">
      <button disabled={!index || !active} onClick={previous}>上一条</button>
      <span>{current ? `${index + 1} / ${page!.items.length}` : "0 / 0"}</span>
      <button disabled={!active || busy || !page || (index + 1 >= page.items.length && !page.next)} onClick={next}>{busy && page ? "正在加载…" : "下一条"}</button>
    </nav>
  </div>;
}

interface EntryPlayback { episodeId: string; playlistId?: string; position: number }
function FeedEntry({ plugin, item, active, onEnded, openMedia }: {
  plugin: InstalledPlugin; item: MediaItem; active: boolean; onEnded: () => void; openMedia: (mediaId: string) => void;
}) {
  const request = usePluginRequests(), host = useHost();
  const [playback, setPlayback] = useState<EntryPlayback | null>(null), [detail, setDetail] = useState<MediaDetail | null>(null);
  const [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const position = useRef(0), duration = useRef<number | undefined>(undefined), started = useRef(false), lastSave = useRef(0);
  const progress = useMemo(() => pluginProgressReporter(plugin.meta.id, item.id, plugin.methods.includes("progress.report")), [plugin.meta.id, plugin.revision, item.id]);
  const latest = useRef({ playback, item: detail || item, refreshLibrary: host.refreshLibrary });
  latest.current = { playback, item: detail || item, refreshLibrary: host.refreshLibrary };
  const writes = useRef(Promise.resolve());
  const save = () => {
    const { playback: selected, item: snapshot, refreshLibrary } = latest.current;
    if (!selected || !started.current) return;
    const args = { pluginId: plugin.meta.id, mediaId: item.id, episodeId: selected.episodeId, playlistId: selected.playlistId, positionSec: position.current, durationSec: duration.current };
    writes.current = writes.current.catch(() => {}).then(async () => {
      await pluginCommand("library.put", { pluginId: plugin.meta.id, item: snapshot });
      await pluginCommand("library.progress.set", args);
      await refreshLibrary();
    });
    return writes.current;
  };
  const saveRef = useRef(save); saveRef.current = save;
  useEffect(() => {
    let live = true; setError("");
    void (async () => {
      let episodeId = item.entryEpisodeId, playlistId: string | undefined;
      if (!episodeId) {
        const result = await request<MediaDetail>("call", { id: plugin.meta.id, method: "media.getDetail", args: { id: item.id } });
        if (!live) return;
        setDetail(result);
        const playlist = result.playlists[0];
        let episode: Episode | undefined = playlist?.episodes[0];
        if (!episode && playlist?.next && plugin.methods.includes("media.listEpisodes")) {
          const episodes = await request<Page<Episode>>("call", { id: plugin.meta.id, method: "media.listEpisodes", args: { mediaId: item.id, playlistId: playlist.id, cursor: playlist.next, limit: 20 } });
          episode = episodes.items[0];
        }
        if (!episode) throw new Error("暂无可播放分集，请打开作品详情选择分集。");
        if (episode.locked) throw new Error(episode.lockReason || "当前分集不可播放，请打开作品详情。");
        episodeId = episode.id; playlistId = playlist.id;
      }
      const saved = await request<LocalProgress | null>("library.progress.get", { pluginId: plugin.meta.id, mediaId: item.id, episodeId, playlistId });
      if (!live) return;
      position.current = saved?.positionSec || 0;
      progress.select(episodeId, position.current);
      setPlayback({ episodeId, playlistId, position: position.current });
    })().catch(e => { if (live) setError(pluginError(e)); });
    return () => { live = false; request.cancelAll(); };
  }, [attempt, plugin.meta.id, item.id, item.entryEpisodeId, progress, request]);
  useEffect(() => { if (!active) { progress.pause(); void saveRef.current()?.catch(() => {}); } }, [active, progress]);
  useEffect(() => () => { progress.pause(); void saveRef.current()?.catch(() => {}); }, [progress]);
  const entry = host.library.find(e => libraryKey(e.pluginId, e.mediaId) === libraryKey(plugin.meta.id, item.id));
  return <article className="hpp-feed-entry" aria-label="当前信息流内容">
    <div className="hpp-feed-stage"><Notice error={error}/>
      {error && !playback && <button onClick={() => setAttempt(v => v + 1)}>重试条目</button>}
      {playback ? <ContentPlayer plugin={plugin} action="media.prepare" contentId={item.id} episodeId={playback.episodeId} playlistId={playback.playlistId} initialPosition={playback.position} active={active}
        onPosition={(p, d) => {
          if (Number.isFinite(p) && p >= 0) position.current = p;
          if (d !== undefined && Number.isFinite(d) && d >= 0) duration.current = d;
          progress.update(p, d);
          if (started.current && performance.now() - lastSave.current >= 10_000) { lastSave.current = performance.now(); void save()?.catch(() => {}); }
        }}
        onPlaying={() => { started.current = true; lastSave.current = performance.now(); progress.playing(); }}
        onStopped={() => { progress.pause(); void save()?.catch(e => setError(pluginError(e))); }}
        onEnded={() => { progress.end(); void save()?.catch(() => {}); onEnded(); }}/>
        : !error && <div className="hpp-player-empty">正在读取播放入口…</div>}
    </div>
    <aside className="hpp-feed-meta"><h2>{item.title}</h2>{item.author && <p>@{item.author.name}</p>}<p className="hpp-feed-description">{item.description}</p>
      <div className="hpp-source-tabs"><button onClick={() => openMedia(item.id)}>作品详情与选集</button><button onClick={() => void host.put(plugin.meta.id, detail || item, { favorite: !entry?.favorite }).catch(e => setError(pluginError(e)))}>{entry?.favorite ? "取消本地收藏" : "本地收藏"}</button></div>
      <MediaInteractions plugin={plugin} detail={detail || item}/>
      {active && <CommentsPanel plugin={plugin} mediaId={item.id} episodeId={playback?.episodeId}/>}
    </aside>
  </article>;
}
