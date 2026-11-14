import { useEffect, useState } from "react";
import { useStore } from "../store";
import { APP_VERSION } from "../environment";
import { useHost } from "./HostContext";
import { BrowseFrame, Notice } from "./BrowsePages";
import { pluginError } from "./client";
import { usePluginRequests } from "./usePluginRequests";
import type { UpdatePolicy } from "./updateClient";
export default function ApplicationSettings({ onBack }: { onBack: () => void }) {
  const app = useStore(), host = useHost(), [error, setError] = useState("");
  const request = usePluginRequests(), [resolverPrefs, setResolverPrefs] = useState<Record<string, string>>({}), [clearing, setClearing] = useState(false);
  useEffect(() => { let live = true; void request<Record<string, string>>("resolver.preferences.get").then(p => { if (live) setResolverPrefs(p); }).catch(e => { if (live) setError(pluginError(e)); }); return () => { live = false; }; }, [request]);
  const clearResolver = async (site?: string) => {
    setClearing(true); setError("");
    try {
      await request(site ? "resolver.preferences.set" : "resolver.preferences.clear", site ? { host: site, pluginId: null } : {});
      setResolverPrefs(await request<Record<string, string>>("resolver.preferences.get"));
    } catch (error) { setError(pluginError(error)); } finally { setClearing(false); }
  };
  const updatePolicy = async (changes: Partial<UpdatePolicy>) => {
    setClearing(true); setError("");
    try { await request("updates.policy.set", { ...host.updates.policy, ...changes }); await host.refreshUpdates(); }
    catch (e) { setError(pluginError(e)); } finally { setClearing(false); }
  };
  return <BrowseFrame title="设置" tools={<button onClick={onBack}>返回</button>}><Notice error={error || app.error}/><section className="hpp-settings-list">
    <label>深色外观<input type="checkbox" checked={app.theme === "dark"} onChange={e => app.setTheme(e.target.checked ? "dark" : "light")}/></label>
    <label>启动时静音<input type="checkbox" checked={app.muteOnStartup} onChange={e => app.setMuteOnStartup(e.target.checked)}/></label>
    <label>自动播放下一条<input type="checkbox" checked={host.prefs.autoNext} onChange={e => host.setPrefs({ autoNext: e.target.checked })}/></label>
    <label>播放失败后尝试其他播放流<input type="checkbox" checked={host.prefs.playbackFallback} onChange={e => host.setPrefs({ playbackFallback: e.target.checked })}/></label>
    <label>显示成人内容<input type="checkbox" checked={host.prefs.mature} onChange={e => host.setPrefs({ mature: e.target.checked })}/></label>
    <label>启动时自动检查插件更新<input type="checkbox" checked={host.updates.policy.checkOnStartup} disabled={clearing} onChange={e => void updatePolicy({ checkOnStartup: e.target.checked })}/></label>
    <label>自动安装插件更新<input type="checkbox" checked={host.updates.policy.autoInstall} disabled={clearing} onChange={e => void updatePolicy({ autoInstall: e.target.checked })}/></label>
    <p className="hpp-muted">自动检查每个插件同一地址至少间隔 24 小时；手动检查随时可用。自动安装只接受更高版本，并在当前播放结束后执行。</p>
    <label>严格安全模式<input type="checkbox" checked={app.strictSecurity} disabled={!app.strictSecurityReady || app.securityPending} onChange={e => void app.setStrictSecurity(e.target.checked).catch(e => setError(pluginError(e)))}/></label>
    <p className="hpp-muted">作用于插件 API 和宿主媒体请求。自建服务需要访问局域网时可关闭。可选网页视图使用独立平台网络栈。</p>
    <section className="hpp-resolver-preferences" aria-label="解析器站点偏好"><div className="hpp-section-title"><h2>解析器站点偏好</h2><button disabled={clearing || !Object.keys(resolverPrefs).length} onClick={() => void clearResolver()}>清空解析器偏好</button></div>
      {Object.entries(resolverPrefs).map(([site, id]) => <div className="hpp-resolver-preference" key={site}><span>{site}</span><span>{host.plugins.find(p => p.meta.id === id)?.meta.name || id}</span><button aria-label={`忘记 ${site} 的解析器`} disabled={clearing} onClick={() => void clearResolver(site)}>忘记</button></div>)}
      {!Object.keys(resolverPrefs).length && <p className="hpp-muted">暂无记住的站点。播放时选择解析器，可勾选记住该站点。</p>}
    </section>
    <p>HGhub {APP_VERSION}</p><p className="hpp-muted">由用户自行导入内容源与解析器的插件视频播放器。HGhub 不内置或分发插件。</p>
  </section></BrowseFrame>;
}
