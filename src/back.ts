/** 全局返回拦截：面板等临时层优先消费，未消费则走导航栈。 */
type Handler = () => boolean;

let handler: Handler | null = null;
const layers: Handler[] = [];

export function registerBackHandler(h: Handler) {
  layers.push(h);
  return () => { const i = layers.indexOf(h); if (i >= 0) layers.splice(i, 1); };
}

export function setBackHandler(h: Handler | null) {
  handler = h;
}

/** 返回 true 表示已被消费（不再退栈） */
export function runBack(): boolean {
  try {
    return layers[layers.length - 1]?.() || (handler ? handler() : false);
  } catch {
    return false;
  }
}
