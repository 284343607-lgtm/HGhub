import { useEffect, useRef, useState } from "react";
import { BrowseFrame, EmptySources, Notice, type OpenMedia } from "./BrowsePages";
import { useHost, libraryKey, type LibraryEntry } from "./HostContext";
import { onPluginAuthFailure, onPluginAuthSuccess, pluginCommand, pluginError, type InstalledPlugin } from "./client";
import { usePluginRequests } from "./usePluginRequests";
import { useAssetUrls } from "./MediaCards";
import type { UserProfile } from "./protocol";
import CloudLibrary from "./CloudLibrary";

export default function LibraryPage({ open, manage, settings }: { open: OpenMedia; manage: (id?: string) => void; settings: () => void }) {
  const host = useHost(), request = usePluginRequests(), [kind, setKind] = useState<"favorite" | "history" | "tracking">("favorite");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const visible = host.library.filter(e => kind === "history" ? !!e.lastProgress : kind === "favorite" ? e.favorite : e.tracking)
    .filter(e => host.prefs.mature || !host.plugins.find(p => p.meta.id === e.pluginId)?.meta.mature)
    .sort((a, b) => kind === "history" ? (b.lastProgress?.at || 0) - (a.lastProgress?.at || 0) : b.updatedAt - a.updatedAt);
  const checkUpdates = async () => {
    setBusy(true); setError(""); setNotice(""); let count = 0;
    try {
      for (const source of host.sources.filter(p => p.methods.includes("updates.check"))) {
        const entries = host.library.filter(e => e.pluginId === source.meta.id && e.tracking);
        for (let i = 0; i < entries.length; i += 50) {
          const batch = entries.slice(i, i + 50);
          try {
            const results = await request<{ mediaId: string; latestLabel?: string; episodeCount?: number; updatedAt?: number }[]>("call", { id: source.meta.id, method: "updates.check", args: { items: batch.map(e => ({ mediaId: e.mediaId, episodeCount: e.item.episodeCount, updatedAt: e.item.updatedAt })) } });
            for (const result of results) {
              const entry = batch.find(e => e.mediaId === result.mediaId); if (!entry) continue;
              await pluginCommand("library.put", { pluginId: source.meta.id, item: { ...entry.item, episodeCount: result.episodeCount ?? entry.item.episodeCount, updatedAt: result.updatedAt ?? entry.item.updatedAt }, latestLabel: result.latestLabel || "有更新" }); count++;
            }
          } catch (e) { setError(`${source.meta.name}：${pluginError(e)}`); }
        }
      }
      await host.refreshLibrary(); setNotice(`已检查追更，${count} 部作品有变化`);
    } finally { setBusy(false); }
  };
  return <BrowseFrame title="我的" tools={<><button onClick={() => manage()}>插件</button><button onClick={settings}>设置</button></>}>
    <Notice error={error || host.error}/><div className="hpp-source-tabs">{([ ["favorite", "本地收藏"], ["history", "观看历史"], ["tracking", "追更"] ] as const).map(([id, label]) => <button key={id} className={kind === id ? "selected" : ""} onClick={() => setKind(id)}>{label}</button>)}
    {kind === "tracking" && <button disabled={busy} onClick={() => void checkUpdates()}>检查追更</button>}{kind === "history" && <button onClick={() => void pluginCommand("library.history.clear").then(host.refreshLibrary).catch(e => setError(pluginError(e)))}>清空观看历史</button>}</div>
    {notice && <p role="status">{notice}</p>}
    <section className="hpp-local-library">{visible.map(entry => {
      const plugin = host.sources.find(p => p.meta.id === entry.pluginId), installed = host.plugins.find(p => p.meta.id === entry.pluginId);
      return <article className="hpp-local-entry" key={libraryKey(entry.pluginId, entry.mediaId)}><h3>{entry.item.title}</h3><p className="hpp-muted">{installed?.meta.name || entry.pluginId} · {!plugin ? "来源不可用" : entry.latestLabel || (entry.lastProgress ? `看到 ${Math.floor(entry.lastProgress.positionSec)} 秒` : "已保存到本地")}</p>
        <button disabled={!plugin?.methods.includes("media.getDetail")} onClick={() => open(entry.pluginId, entry.mediaId)}>{kind === "history" ? "继续观看" : "查看作品"}</button>
        {entry.favorite && <button onClick={() => void host.put(entry.pluginId, entry.item, { favorite: false }).catch(e => setError(pluginError(e)))}>取消本地收藏</button>}<AssociatedSources entry={entry} open={open}/></article>;
    })}</section>{!visible.length && <p className="hpp-muted">还没有{kind === "history" ? "观看记录" : kind === "tracking" ? "追更作品" : "本地收藏"}。</p>}
    <div className="hpp-section-title"><h2>插件账号与云端片库</h2></div>{host.sources.filter(p => p.methods.includes("auth.getProfile") || p.methods.includes("library.listMedia")).map(p => <Account key={p.meta.id + p.revision} plugin={p} open={open} manage={() => manage(p.meta.id)}/>)}
    {!host.sources.length && <EmptySources manage={() => manage()}/>}
  </BrowseFrame>;
}
function AssociatedSources({ entry, open }: { entry: LibraryEntry; open: OpenMedia }) {
  const host = useHost(), request = usePluginRequests(), [expanded, setExpanded] = useState(false);
  const [sources, setSources] = useState<LibraryEntry[]>([]), [error, setError] = useState("");
  useEffect(() => {
    if (!expanded) return;
    let live = true;
    void request<LibraryEntry[]>("library.sources.get", { pluginId: entry.pluginId, mediaId: entry.mediaId }).then(result => { if (live) setSources(result); }).catch(e => { if (live) setError(pluginError(e)); });
    return () => { live = false; request.cancelAll(); };
  }, [expanded, entry.pluginId, entry.mediaId, request]);
  return <div><button aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>关联来源</button>{expanded && <><Notice error={error}/>{sources.filter(e => host.prefs.mature || !host.plugins.find(p => p.meta.id === e.pluginId)?.meta.mature).map(source => {
    const plugin = host.sources.find(p => p.meta.id === source.pluginId);
    return <p key={libraryKey(source.pluginId, source.mediaId)}><button disabled={!plugin?.methods.includes("media.getDetail")} onClick={() => open(source.pluginId, source.mediaId)}>{source.item.title} · {plugin?.meta.name || source.pluginId}{plugin ? "" : " · 来源不可用"}</button></p>;
  })}{!sources.length && !error && <p className="hpp-muted">尚未关联其他来源</p>}</>}</div>;
}
function Account({ plugin: p, open, manage }: { plugin: InstalledPlugin; open: OpenMedia; manage: () => void }) {
  const request = usePluginRequests(), epoch = useRef(0);
  const [profile, setProfile] = useState<UserProfile | null>(null), [error, setError] = useState("");
  const avatar = useAssetUrls(p.meta.id, profile?.avatar ? [profile.avatar] : []);
  const getProfile = () => {
    const n = ++epoch.current;
    if (p.methods.includes("auth.getProfile")) void request<UserProfile | null>("call", { id: p.meta.id, method: "auth.getProfile", args: {} }).then(r => { if (n === epoch.current) setProfile(r); }).catch(e => { if (n === epoch.current) setError(pluginError(e)); });
  };
  useEffect(() => { getProfile(); return () => { epoch.current++; }; }, [p.meta.id]);
  useEffect(() => onPluginAuthFailure(f => { if (f.id === p.meta.id) { epoch.current++; setProfile(null); if (!f.silent) setError(f.message); } }), [p.meta.id]);
  useEffect(() => onPluginAuthSuccess(id => { if (id === p.meta.id) { setError(""); getProfile(); } }), [p.meta.id]);
  return <section className="hpp-account"><div className="hpp-section-title"><h3>{p.meta.name}</h3><button onClick={manage}>账号与操作</button></div><Notice error={error}/>{profile ? <div className="hpp-profile">{avatar[0] && <img src={avatar[0]} alt=""/>}<strong>{profile.name}</strong><p>{profile.description}</p></div> : p.methods.includes("auth.getProfile") && <p className="hpp-muted">未登录此插件</p>}
    {p.methods.includes("library.listMedia") && <CloudLibrary plugin={p} open={open}/>}
  </section>;
}
