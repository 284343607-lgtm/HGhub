import { useEffect, useRef, useState } from "react";
import { useHost } from "./HostContext";
import { pluginError, type InstalledPlugin } from "./client";
import { usePluginRequests } from "./usePluginRequests";
import type { Category, Filter, FilterOption, MediaItem, Page, Section } from "./protocol";
import MediaCards from "./MediaCards";
import type { OpenSection } from "./SectionPage";
import { mergeSearch, type SearchHit } from "./searchModel";
import HomeArrangement, { ReorderList } from "./HomeArrangement";
import { PageLoadMore, usePagedPlugin } from "./usePagedPlugin";

// Cache fulfilled metadata only. A view owns its in-flight request and may cancel it.
const categoryTrees = new Map<string, { revision: string; tree: Category[] }>();

export type OpenMedia = (pluginId:string,mediaId:string)=>void;
export function BrowseFrame({title,children,tools}:{title:string;children:React.ReactNode;tools?:React.ReactNode}) {
  return <div className="hpp-page"><header className="hpp-header"><div><h1>{title}</h1><p>你的来源，你的选择</p></div><div className="hpp-header-tools">{tools}</div></header><div className="hpp-scroll"><div className="hpp-content">{children}</div></div></div>;
}
export function Notice({error}:{error:string}){return error?<p role="alert" className="hpp-error">{error}</p>:null;}
export function EmptySources({manage}:{manage:()=>void}) {return <div className="hpp-empty"><h2>从一个插件开始</h2><p>导入你选择的数据源，发现影视、短剧与更多内容。</p><button className="primary" onClick={manage}>管理插件</button></div>;}
function Scope({kind,plugins}:{kind:"home"|"search";plugins:InstalledPlugin[]}) {
  const {prefs,setPrefs}=useHost(),mode=kind==="home"?prefs.homeMode:prefs.searchMode,ids=kind==="home"?prefs.homeIds:prefs.searchIds;
  const update=(mode:string,ids:string[])=>setPrefs(kind==="home"?{homeMode:mode as typeof prefs.homeMode,homeIds:ids}:{searchMode:mode as typeof prefs.searchMode,searchIds:ids});
  return <div className="hpp-scope"><label>{kind==="home"?"首页来源":"搜索范围"}<select aria-label={kind==="home"?"首页来源":"搜索范围"} value={mode} onChange={e=>update(e.target.value,ids.length?ids:plugins.slice(0,1).map(p=>p.meta.id))}><option value="all">综合</option><option value="single">单个插件</option><option value="multiple">多个插件</option></select></label>{mode!=="all"&&plugins.map(p=><label key={p.meta.id}><input type={mode==="single"?"radio":"checkbox"} name={`${kind}-scope`} checked={ids.includes(p.meta.id)} onChange={e=>update(mode,mode==="single"?[p.meta.id]:e.target.checked?[...ids,p.meta.id]:ids.filter(id=>id!==p.meta.id))}/>{p.meta.name}</label>)}</div>;
}
export function PluginHome({open,manage,openSection,openContent}:{open:OpenMedia;manage:()=>void;openSection:OpenSection;openContent:(kind:"live"|"articles"|"feed",pluginId:string)=>void}) {
  const {sources,prefs,error}=useHost(),[adjust,setAdjust]=useState(false),[refresh,setRefresh]=useState(0);
  const available=sources.filter(p=>p.methods.includes("home.getSections"));
  const contentEntries=sources.filter(p=>!prefs.hiddenHomeIds.includes(p.meta.id)&&(p.methods.includes("live.resolve")||p.methods.includes("articles.list")||p.methods.includes("feed.list")));
  const chosen=prefs.homeMode==="all"?available:prefs.homeIds.flatMap(id=>available.find(p=>p.meta.id===id)||[]).slice(0,prefs.homeMode==="single"?1:undefined);
  return <BrowseFrame title="首页" tools={<><button onClick={()=>setRefresh(n=>n+1)}>刷新首页</button><button onClick={()=>setAdjust(v=>!v)}>调整</button><button onClick={manage}>插件</button></>}><Notice error={error}/>{contentEntries.length>0&&<nav className="hpp-content-entries" aria-label="其他内容">{contentEntries.flatMap(p=>[...(p.methods.includes("live.resolve")?[<button key={p.meta.id+"live"} onClick={()=>openContent("live",p.meta.id)}>直播 · {p.meta.name}</button>]:[]),...(p.methods.includes("articles.list")?[<button key={p.meta.id+"articles"} onClick={()=>openContent("articles",p.meta.id)}>图文 · {p.meta.name}</button>]:[]),...(p.methods.includes("feed.list")?[<button key={p.meta.id+"feed"} onClick={()=>openContent("feed",p.meta.id)}>信息流 · {p.meta.name}</button>]:[])])}</nav>}{available.length>1&&<Scope kind="home" plugins={available}/>}{adjust&&<HomeArrangement sources={sources}/>}{!sources.length?<EmptySources manage={manage}/>:chosen.filter(p=>adjust||!prefs.hiddenHomeIds.includes(p.meta.id)).map(p=><HomeSource key={p.meta.id+p.revision} plugin={p} open={open} openSection={openSection} adjust={adjust} refreshToken={refresh}/>)}{sources.length>0&&!chosen.some(p=>!prefs.hiddenHomeIds.includes(p.meta.id))&&!contentEntries.length&&<p className="hpp-muted">请选择参与首页的来源。</p>}</BrowseFrame>;
}
function HomeSource({plugin:p,open,adjust,openSection,refreshToken}:{plugin:InstalledPlugin;open:OpenMedia;adjust:boolean;openSection:OpenSection;refreshToken:number}) {
  const {prefs,setPrefs}=useHost(),list=usePagedPlugin<Section>({plugin:p,method:"home.getSections",limit:20}),lastRefresh=useRef(refreshToken);
  useEffect(()=>{if(lastRefresh.current!==refreshToken){lastRefresh.current=refreshToken;list.refresh();}},[refreshToken]);
  const order=Array.isArray(prefs.sectionOrder[p.meta.id])?prefs.sectionOrder[p.meta.id]:[];
  const sections=[...list.page?.items||[]].sort((a,b)=>{const rank=(id:string)=>{const n=order.indexOf(id);return n<0?order.length:n;};return rank(a.id)-rank(b.id);});
  const sectionKey=(id:string)=>JSON.stringify([p.meta.id,id]),hidden=prefs.hiddenHomeIds.includes(p.meta.id);
  return <section className="hpp-home-source" aria-label={`${p.meta.name}的推荐`}><Notice error={list.error||list.warning}/>{list.error&&<button onClick={list.retry}>重试 {p.meta.name}</button>}{list.busy&&!list.page&&<div className="hpp-skeleton" aria-label="正在加载推荐"/>}
    {adjust&&sections.length>0&&<section className="hpp-section-arrange"><div className="hpp-section-title"><h3>{p.meta.name}的分区</h3><button onClick={()=>setPrefs({hiddenSections:prefs.hiddenSections.filter(k=>!sections.some(s=>sectionKey(s.id)===k))})}>全部参与 · {p.meta.name}</button></div><ReorderList label={`${p.meta.name}的分区顺序`} ids={sections.map(s=>s.id)} name={id=>sections.find(s=>s.id===id)!.title||id}
      render={id=><label className="hpp-check"><input type="checkbox" checked={!prefs.hiddenSections.includes(sectionKey(id))} onChange={e=>setPrefs({hiddenSections:e.target.checked?prefs.hiddenSections.filter(k=>k!==sectionKey(id)):[...prefs.hiddenSections,sectionKey(id)]})}/>{p.meta.name} · {sections.find(s=>s.id===id)!.title||id}</label>}
      change={ids=>setPrefs({sectionOrder:{...prefs.sectionOrder,[p.meta.id]:[...ids,...order.filter(id=>!ids.includes(id))]}})}/></section>}
    {!hidden&&sections.filter(s=>!prefs.hiddenSections.includes(sectionKey(s.id))&&s.items.length>0).map(s=><HomeSection key={s.id} plugin={p} section={s} open={open} openSection={openSection}/>)}
    {list.page?.next&&<PageLoadMore next={list.page.next} busy={list.busy} error={list.error} more={list.more} label={`更多推荐分区 · ${p.meta.name}`} auto={!adjust&&!hidden}/>}
  </section>;
}
function HomeSection({plugin:p,section:s,open,openSection}:{plugin:InstalledPlugin;section:Section;open:OpenMedia;openSection:OpenSection}) {
  return <section className={`hpp-section hpp-layout-${s.layout}`}><div className="hpp-section-title"><h2>{s.title||"推荐"}<small>{p.meta.name}</small></h2>{s.more&&p.methods.includes("home.listSection")&&<button onClick={()=>openSection(p.meta.id,s.id,s.title)}>查看更多</button>}</div><MediaCards pluginId={p.meta.id} items={s.items} landscape={s.layout==="banner"||s.imageAspect==="landscape"} open={i=>open(p.meta.id,i.id)}/></section>;
}
export function FilterControls({filters,values,change}:{filters:Filter[];values:Record<string,string[]>;change:(v:Record<string,string[]>)=>void}) {
  return <div className="hpp-filters">{filters.map(f=><fieldset key={f.id}><legend>{f.label}</legend>{f.options.map(o=><label key={o.id}><input type={f.multiple?"checkbox":"radio"} name={`filter-${f.id}`} checked={(values[f.id]||[]).includes(o.id)} onChange={e=>change({...values,[f.id]:f.multiple?e.target.checked?[...(values[f.id]||[]),o.id]:(values[f.id]||[]).filter(id=>id!==o.id):[o.id]})}/>{o.label}</label>)}<button type="button" onClick={()=>change({...values,[f.id]:[]})}>不限</button></fieldset>)}</div>;
}
export function PluginCategory({open,manage}:{open:OpenMedia;manage:()=>void}) {
  const {sources}=useHost(),available=sources.filter(p=>p.methods.includes("catalog.getCategories")),[selected,setSelected]=useState("");
  const current=available.find(p=>p.meta.id===selected)||available[0];
  return <BrowseFrame title="分类" tools={<button onClick={manage}>插件</button>}><div className="hpp-source-tabs">{available.map(p=><button className={current===p?"selected":""} key={p.meta.id} onClick={()=>setSelected(p.meta.id)}>{p.meta.name}</button>)}</div>{current?<CategorySource key={current.meta.id+current.revision} plugin={current} open={open}/>:<EmptySources manage={manage}/>}</BrowseFrame>;
}
function CategorySource({plugin:p,open}:{plugin:InstalledPlugin;open:OpenMedia}) {
  const metadata=usePluginRequests(),[tree,setTree]=useState<Category[]>([]),[category,setCategory]=useState(""),[error,setError]=useState(""),[filters,setFilters]=useState<Filter[]>([]),[sorts,setSorts]=useState<FilterOption[]>([]),[values,setValues]=useState<Record<string,string[]>>({}),[sort,setSort]=useState("");
  const list=usePagedPlugin<MediaItem>({plugin:p,method:"catalog.list",args:{categoryId:category,filters:values,sort:sort||undefined},enabled:!!category});
  useEffect(()=>{let live=true;const cached=categoryTrees.get(p.meta.id);const load=cached?.revision===p.revision?Promise.resolve(cached.tree):metadata<Category[]>("call",{id:p.meta.id,method:"catalog.getCategories",args:{}});void load.then(r=>{if(live){categoryTrees.set(p.meta.id,{revision:p.revision,tree:r});setTree(r);setCategory(r[0]?.children?.[0]?.id||r[0]?.id||"");}}).catch(e=>{if(live)setError(pluginError(e));});return()=>{live=false;};},[p.meta.id,p.revision,metadata]);
  useEffect(()=>{let live=true;setValues({});setSort("");const c=tree.flatMap(c=>[c,...c.children||[]]).find(c=>c.id===category);setFilters(c?.filters||[]);setSorts(c?.sorts||[]);if(category&&p.methods.includes("catalog.getFilters"))void metadata<{filters?:Filter[];sorts?:FilterOption[]}>("call",{id:p.meta.id,method:"catalog.getFilters",args:{categoryId:category}}).then(r=>{if(live){setFilters(r.filters||[]);setSorts(r.sorts||[]);}}).catch(e=>{if(live)setError(pluginError(e));});return()=>{live=false;};},[category]);
  return <><div className="hpp-category-tree">{tree.map(c=><div key={c.id}><button className={category===c.id?"selected":""} onClick={()=>setCategory(c.id)}>{c.label}</button>{c.children?.map(child=><button key={child.id} className={category===child.id?"selected":""} onClick={()=>setCategory(child.id)}>{child.label}</button>)}</div>)}</div><FilterControls filters={filters} values={values} change={setValues}/>{!!sorts.length&&<label>排序 <select aria-label="分类排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="">默认</option>{sorts.map(s=><option value={s.id} key={s.id}>{s.label}</option>)}</select></label>}<Notice error={error||list.error||list.warning}/>{list.error&&<button onClick={list.retry}>重试分类</button>}{list.busy&&!list.page?<div className="hpp-skeleton"/>:<MediaCards pluginId={p.meta.id} items={list.page?.items||[]} open={i=>open(p.meta.id,i.id)}/>}<PageLoadMore next={list.page?.next} busy={list.busy} error={list.error} more={list.more}/></>;
}
export function PluginSearch({open,manage}:{open:OpenMedia;manage:()=>void}) {
  const {sources,prefs}=useHost(),request=usePluginRequests(),metadata=usePluginRequests(),suggestRequest=usePluginRequests(),[query,setQuery]=useState(""),[submitted,setSubmitted]=useState(""),[pages,setPages]=useState<Record<string,Page<MediaItem>>>({}),[errors,setErrors]=useState<Record<string,string>>({}),[busy,setBusy]=useState<Record<string,boolean>>({}),[tab,setTab]=useState("all"),[choice,setChoice]=useState<SearchHit[]|null>(null),[suggest,setSuggest]=useState<string[]>([]),[trending,setTrending]=useState<Record<string,string[]>>({}),[filters,setFilters]=useState<Filter[]>([]),[values,setValues]=useState<Record<string,string[]>>({}),epoch=useRef(0);
  const locks=useRef(new Map<string,number>()), consumed=useRef(new Map<string,Set<string>>()), failedCursors=useRef(new Map<string,string|undefined>()), searchFilters=useRef<Record<string,string[]>>({});
  const [warnings,setWarnings]=useState<Record<string,string>>({});
  const available=sources.filter(p=>p.methods.includes("search.search")),chosen=prefs.searchMode==="all"?available:prefs.searchIds.flatMap(id=>available.find(p=>p.meta.id===id)||[]).slice(0,prefs.searchMode==="single"?1:undefined),ids=chosen.map(p=>p.meta.id+p.revision).join("|");
  useEffect(()=>{let live=true;setTrending({});for(const p of chosen)if(p.methods.includes("search.trending"))void metadata<string[]>("call",{id:p.meta.id,method:"search.trending",args:{}}).then(r=>{if(live)setTrending(old=>({...old,[p.meta.id]:r}));}).catch(()=>{});return()=>{live=false;};},[ids]);
  useEffect(()=>{let live=true;setFilters([]);setValues({});const p=prefs.searchMode==="single"?chosen[0]:undefined;if(p?.methods.includes("search.getFilters"))void metadata<Filter[]>("call",{id:p.meta.id,method:"search.getFilters",args:{}}).then(r=>{if(live)setFilters(r);}).catch(()=>{});return()=>{live=false;};},[ids,prefs.searchMode]);
  useEffect(()=>{let live=true;setSuggest([]);const p=prefs.searchMode==="single"?chosen[0]:undefined;const timer=window.setTimeout(()=>{if(query.trim()&&p?.methods.includes("search.suggest"))void suggestRequest<string[]>("call",{id:p.meta.id,method:"search.suggest",args:{query}}).then(r=>{if(live)setSuggest(r);}).catch(()=>{});},300);return()=>{live=false;clearTimeout(timer);suggestRequest.cancelAll();};},[query,ids,prefs.searchMode]);
  useEffect(()=>{request.cancelAll();epoch.current++;setPages({});setErrors({});setBusy({});setSubmitted("");setTab(prefs.searchMode==="all"?"all":chosen[0]?.meta.id||"");return()=>{epoch.current++;request.cancelAll();};},[ids,prefs.searchMode]);
  const load=async(p:InstalledPlugin,q:string,n:number,cursor?:string)=>{
    if(n!==epoch.current||locks.current.get(p.meta.id)===n||cursor!==undefined&&consumed.current.get(p.meta.id)?.has(cursor))return;
    locks.current.set(p.meta.id,n);failedCursors.current.set(p.meta.id,cursor);
    setBusy(old=>({...old,[p.meta.id]:true}));setErrors(old=>({...old,[p.meta.id]:""}));
    try{
      const r=await request<Page<MediaItem>>("call",{id:p.meta.id,method:"search.search",args:{query:q,filters:searchFilters.current,cursor,limit:40}});
      if(n!==epoch.current)return;
      const seen=cursor===undefined?new Set<string>():consumed.current.get(p.meta.id)||new Set<string>();
      if(cursor!==undefined)seen.add(cursor);consumed.current.set(p.meta.id,seen);
      const repeated=!!r.next&&seen.has(r.next);
      setWarnings(old=>({...old,[p.meta.id]:repeated?"来源返回了重复分页游标，已停止继续加载。":""}));
      setPages(old=>{
        const previous=cursor===undefined?[]:old[p.meta.id]?.items||[],ids=new Set(previous.map(i=>i.id));
        return {...old,[p.meta.id]:{...r,next:repeated?null:r.next,items:[...previous,...r.items.filter(i=>{if(ids.has(i.id))return false;ids.add(i.id);return true;})]}};
      });
    }catch(e){if(n===epoch.current&&(e as {code?:string}).code!=="CANCELLED")setErrors(old=>({...old,[p.meta.id]:pluginError(e)}));}
    finally{if(locks.current.get(p.meta.id)===n)locks.current.delete(p.meta.id);if(n===epoch.current)setBusy(old=>({...old,[p.meta.id]:false}));}
  };
  const search=(q=query)=>{if(!q.trim())return;request.cancelAll();const n=++epoch.current;locks.current.clear();consumed.current.clear();failedCursors.current.clear();searchFilters.current=values;setSubmitted(q);setPages({});setErrors({});setWarnings({});setBusy({});setChoice(null);setSuggest([]);for(const p of chosen)void load(p,q,n);};
  useEffect(()=>{if(submitted)search(submitted);},[JSON.stringify(values)]);
  const hits=chosen.flatMap(p=>(pages[p.meta.id]?.items||[]).map(item=>({pluginId:p.meta.id,item}))),groups=mergeSearch(hits);
  return <BrowseFrame title="搜索" tools={<button onClick={manage}>插件</button>}><form className="hpp-search" onSubmit={e=>{e.preventDefault();search();}}><input aria-label="搜索所有插件" placeholder="作品、演员或关键词" value={query} onChange={e=>setQuery(e.target.value)}/><button className="primary" disabled={!query.trim()||!chosen.length}>搜索</button></form><Scope kind="search" plugins={available}/><FilterControls filters={filters} values={values} change={setValues}/>{!!suggest.length&&<div className="hpp-source-tabs">{suggest.map(s=><button key={s} onClick={()=>{setQuery(s);search(s);}}>{s}</button>)}</div>}{!available.length?<EmptySources manage={manage}/>:!submitted?<div className="hpp-trending">{chosen.map(p=><section key={p.meta.id}><h3>{p.meta.name}</h3><div className="hpp-source-tabs">{trending[p.meta.id]?.map(s=><button key={s} onClick={()=>{setQuery(s);search(s);}}>{s}</button>)}</div></section>)}</div>:<><div className="hpp-source-tabs">{prefs.searchMode==="all"&&<button className={tab==="all"?"selected":""} onClick={()=>setTab("all")}>全部</button>}{chosen.map(p=><button key={p.meta.id} className={tab===p.meta.id?"selected":""} onClick={()=>setTab(p.meta.id)}>{p.meta.name}{busy[p.meta.id]?" · 加载中":` · ${pages[p.meta.id]?.items.length||0}`}</button>)}</div>{choice?<div className="hpp-source-choice"><h2>选择内容来源</h2><button onClick={()=>setChoice(null)}>返回搜索</button>{choice.map(h=><button key={h.pluginId+h.item.id} onClick={()=>open(h.pluginId,h.item.id)}>{sources.find(p=>p.meta.id===h.pluginId)?.meta.name} · {h.item.title}</button>)}</div>:tab==="all"?<><div className="hpp-merged">{groups.map((g,i)=><button key={i} onClick={()=>g.length>1?setChoice(g):open(g[0].pluginId,g[0].item.id)}><strong>{g[0].item.title}</strong><span>{new Set(g.map(h=>h.pluginId)).size} 个来源</span><small>{[g[0].item.year,g[0].item.type].filter(Boolean).join(" · ")}</small></button>)}</div>{chosen.map(p=><section key={p.meta.id}><Notice error={errors[p.meta.id]||warnings[p.meta.id]||""}/>{errors[p.meta.id]&&<button onClick={()=>void load(p,submitted,epoch.current,failedCursors.current.get(p.meta.id))}>重试 {p.meta.name}</button>}{pages[p.meta.id]?.next&&<PageLoadMore next={pages[p.meta.id].next} busy={!!busy[p.meta.id]} error={errors[p.meta.id]||""} more={()=>void load(p,submitted,epoch.current,pages[p.meta.id].next||undefined)} label={`加载更多 · ${p.meta.name}`}/>}</section>)}</>:chosen.filter(p=>p.meta.id===tab).map(p=><section key={p.meta.id}><Notice error={errors[p.meta.id]||warnings[p.meta.id]||""}/>{errors[p.meta.id]&&<button onClick={()=>void load(p,submitted,epoch.current,failedCursors.current.get(p.meta.id))}>重试搜索</button>}<MediaCards pluginId={p.meta.id} items={pages[p.meta.id]?.items||[]} open={i=>open(p.meta.id,i.id)}/>{pages[p.meta.id]&&<PageLoadMore next={pages[p.meta.id].next} busy={!!busy[p.meta.id]} error={errors[p.meta.id]||""} more={()=>void load(p,submitted,epoch.current,pages[p.meta.id].next||undefined)}/>}</section>)}</>}</BrowseFrame>;
}
