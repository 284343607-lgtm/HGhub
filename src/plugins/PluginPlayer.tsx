import { useEffect, useRef } from "react";
import Hls from "hls.js";
import { pluginCommand, type PreparedMedia } from "./client";
import { useStore } from "../store";

export default function PluginPlayer({ media, position, onPosition, onFailure, onStopped, onPlaying, onEnded }: {
  media: PreparedMedia; position: number; onPosition: (seconds: number, duration?: number) => void; onFailure: () => void; onStopped?: () => void;
  onPlaying?: () => void; onEnded?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const app = useStore();
  const stopped = useRef(false);
  const callbacks = useRef({ onPosition, onFailure, onStopped, onPlaying, onEnded }); callbacks.current = { onPosition, onFailure, onStopped, onPlaying, onEnded };
  const activity = (playing: boolean) => { void pluginCommand("media.activity", { sessionId: media.sessionId, playing }).then(() => { if (!playing) window.dispatchEvent(new Event("hpp.playback.idle")); }).catch(() => {}); };
  useEffect(() => {
    const video = ref.current; if (!video) return;
    stopped.current = false;
    video.muted = app.muted; video.volume = app.volume;
    let hls: Hls | undefined, failed = false;
    const fail = () => { if (!failed) { failed = true; callbacks.current.onFailure(); } };
    const loaded = () => { if (position > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(position, Math.max(0, video.duration - 0.1)); void video.play().catch(() => {}); };
    video.addEventListener("loadedmetadata", loaded); video.addEventListener("error", fail);
    if (media.format === "hls" && Hls.isSupported()) {
      hls = new Hls({ enableWorker: false }); hls.loadSource(media.url); hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) fail(); });
    } else video.src = media.url;
    const expiry = media.playback.expiresAt;
    const timer = expiry ? window.setTimeout(fail, Math.max(1000, Math.min(2_147_483_647, expiry - Date.now() - 5000))) : undefined;
    return () => {
      stopped.current = true;
      if (timer) clearTimeout(timer);
      video.removeEventListener("loadedmetadata", loaded); video.removeEventListener("error", fail);
      hls?.destroy(); video.pause(); video.removeAttribute("src"); video.load();
    };
    // Position is a snapshot for this media URL; time updates must not reload playback.
  }, [media]);
  return <video ref={ref} className="hpp-video" controls autoPlay playsInline crossOrigin="anonymous"
    onVolumeChange={e => { app.setMuted(e.currentTarget.muted); app.setVolume(e.currentTarget.volume); }}
    onPlaying={e => { if (!stopped.current) { activity(true); callbacks.current.onPosition(e.currentTarget.currentTime, e.currentTarget.duration); callbacks.current.onPlaying?.(); } }}
    onPause={e => { if (!stopped.current && !e.currentTarget.ended) { callbacks.current.onPosition(e.currentTarget.currentTime, e.currentTarget.duration); callbacks.current.onStopped?.(); } }}
    onEnded={e => { if (!stopped.current) { callbacks.current.onPosition(e.currentTarget.currentTime, e.currentTarget.duration); callbacks.current.onEnded?.(); activity(false); } }}
    onTimeUpdate={e => { if (!stopped.current) callbacks.current.onPosition(e.currentTarget.currentTime, e.currentTarget.duration); }}>
    {media.playback.subtitles?.filter(t => t.format === "vtt").map((t, i) => <track key={t.url} src={t.url} kind="subtitles" label={t.label || t.language || `字幕 ${i + 1}`} srcLang={t.language} default={t.default} />)}
  </video>;
}
