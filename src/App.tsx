import { useEffect, useState } from "react";
import { useStore, type Tab } from "./store";
import { isMobile } from "./environment";
import { DesktopRail, DesktopTitleBar } from "./components/DesktopChrome";
import ResizeHandles from "./components/ResizeHandles";
import Plugins from "./pages/Plugins";
import { HostProvider, useHost } from "./plugins/HostContext";
import { BrowseFrame, PluginHome, PluginCategory, PluginSearch } from "./plugins/BrowsePages";
import PluginMediaDetail from "./plugins/PluginMediaDetail";
import LibraryPage from "./plugins/LibraryPage";
import ApplicationSettings from "./plugins/ApplicationSettings";
import SectionPage from "./plugins/SectionPage";
import LivePage from "./plugins/LivePage";
import ArticlePage, { ArticleList } from "./plugins/ArticlePage";
import FeedPage from "./plugins/FeedPage";
import type { SourceStart } from "./plugins/sourceMatching";
import { pendingUpdates } from "./plugins/updateClient";
import "./plugins/plugins.css";
export default function App() { return <HostProvider><Application/></HostProvider>; }
function Application() {
  const app=useStore(),host=useHost(),[collapsed,setCollapsed]=useState(false),top=app.stack[app.stack.length-1];
  const manage=(focusId?:string)=>{host.clearAuth();app.push({kind:"plugins",focusId});};
  const open=(pluginId:string,mediaId:string)=>app.push({kind:"media",pluginId,mediaId});
  useEffect(()=>{const fn=(e:KeyboardEvent)=>{
    const target=e.target as HTMLElement;
    if(target.closest("input,textarea,select,[contenteditable=true],[role=dialog]"))return;
    if(e.key==="Escape"){if(document.fullscreenElement)void document.exitFullscreen();else app.pop();}
    else if(e.key==="/"){e.preventDefault();app.setTab("search");}
    else if(!e.repeat&&["1","2","3","4"].includes(e.key))app.setTab((["home","search","category","profile"] as Tab[])[Number(e.key)-1]);
  };window.addEventListener("keydown",fn);return()=>window.removeEventListener("keydown",fn);},[app.pop,app.setTab]);
  return <div className={`absolute inset-0 flex flex-col bg-canvas win-root plat-${app.platform}`}>
    {!isMobile&&<DesktopTitleBar collapsed={collapsed} onToggle={()=>setCollapsed(v=>!v)}/>}
    <div className="relative flex-1 min-h-0 flex">{!isMobile&&<DesktopRail collapsed={collapsed}/>}<main className="relative flex-1 min-w-0 overflow-hidden win-main">
      {!top&&(app.tab==="home"?<PluginHome open={open} openSection={(pluginId,sectionId,title)=>app.push({kind:"section",pluginId,sectionId,title})} openContent={(kind,pluginId)=>app.push({kind,pluginId})} manage={manage}/>:app.tab==="category"?<PluginCategory open={open} manage={manage}/>:app.tab==="search"?<PluginSearch open={open} manage={manage}/>:<LibraryPage open={open} manage={manage} settings={()=>app.push({kind:"settings"})}/>)}
      {app.stack.map((page,i)=><div key={page.key} className={`absolute inset-0 bg-bg ${i===app.stack.length-1?"z-30":"invisible pointer-events-none"}`}>
        {page.kind==="plugins"?<Plugins onBack={app.pop} focusId={page.focusId}/>:page.kind==="settings"?<ApplicationSettings onBack={app.pop}/>:page.kind==="section"?<SectionRoute {...page} open={open} onBack={app.pop}/>:page.kind==="media"?<MediaPage pluginId={page.pluginId} mediaId={page.mediaId} start={page.start} onBack={app.pop} manage={manage} active={i===app.stack.length-1} onSwitch={(pluginId,mediaId,start)=>app.replace({kind:"media",pluginId,mediaId,start})}/>:<ContentRoute page={page} active={i===app.stack.length-1}/>}
      </div>)}
      {host.authPrompt&&<div className="hpp-global-auth" role="status"><span>{host.authPrompt.message}</span><button onClick={()=>manage(host.authPrompt?.id)}>前往插件登录</button><button onClick={host.clearAuth}>关闭</button></div>}
      {pendingUpdates(host.updates).length>0&&!top&&<div className="hpp-global-updates" role="status"><span>{pendingUpdates(host.updates).length} 个插件有更新{host.updates.policy.autoInstall?"，将在播放结束后安装":""}</span><button onClick={()=>manage()}>查看插件更新</button></div>}
    </main></div>
    {isMobile&&<nav className="hpp-mobile-nav">{([["home","首页"],["category","分类"],["search","搜索"],["profile","我的"]] as const).map(([id,label])=><button key={id} aria-current={app.tab===id?"page":undefined} onClick={()=>app.setTab(id)}>{label}</button>)}</nav>}
    {app.platform==="windows"&&<ResizeHandles/>}
  </div>;
}
function ContentRoute({ page, active }: { page: Extract<import("./store").Page, { kind: "live" | "articles" | "article" | "feed" }>; active: boolean }) {
  const host = useHost(), app = useStore(), plugin = host.sources.find(p => p.meta.id === page.pluginId);
  if (!plugin) return <BrowseFrame title="来源不可用" tools={<button onClick={app.pop}>返回</button>}><p>请重新启用该来源。</p></BrowseFrame>;
  const key = plugin.meta.id + plugin.revision;
  if (page.kind === "feed") return <FeedPage key={key} plugin={plugin} active={active} onBack={app.pop} openMedia={mediaId => app.push({ kind: "media", pluginId: plugin.meta.id, mediaId })}/>;
  if (page.kind === "live") return <LivePage key={key} plugin={plugin} active={active} onBack={app.pop}/>;
  if (page.kind === "articles") return <ArticleList key={key} plugin={plugin} onBack={app.pop} open={articleId => app.push({ kind: "article", pluginId: plugin.meta.id, articleId })}/>;
  return <ArticlePage key={key + page.articleId} plugin={plugin} articleId={page.articleId} active={active} onBack={app.pop} openMedia={mediaId => app.push({ kind: "media", pluginId: plugin.meta.id, mediaId })}/>;
}
function SectionRoute({pluginId,sectionId,title,open,onBack}:{pluginId:string;sectionId:string;title?:string;open:(pluginId:string,mediaId:string)=>void;onBack:()=>void}) {
  const plugin=useHost().sources.find(p=>p.meta.id===pluginId);
  return plugin?<SectionPage key={pluginId+sectionId+plugin.revision} plugin={plugin} sectionId={sectionId} title={title} open={open} onBack={onBack}/>:<BrowseFrame title="来源不可用" tools={<button onClick={onBack}>返回</button>}><p>请启用该分区的数据源。</p></BrowseFrame>;
}
function MediaPage({pluginId,mediaId,onBack,manage,active,start,onSwitch}: {pluginId:string;mediaId:string;onBack:()=>void;manage:()=>void;active:boolean;start?:SourceStart;onSwitch:(pluginId:string,mediaId:string,start?:SourceStart)=>void}) {
  const host=useHost(),plugin=host.sources.find(p=>p.meta.id===pluginId);
  return plugin?<PluginMediaDetail key={pluginId+mediaId+plugin.revision} plugin={plugin} mediaId={mediaId} onBack={onBack} manage={manage} active={active} start={start} onSwitch={onSwitch}/>:<BrowseFrame title="来源不可用" tools={<button onClick={onBack}>返回</button>}><p>请重新导入或启用该作品的数据源。</p><button onClick={manage}>管理插件</button></BrowseFrame>;
}
