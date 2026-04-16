// Fake realtime bus.
// Uses BroadcastChannel (cross-tab, same origin) with a window-event fallback.
// Exposes a Supabase-shaped channel API so pages look like they're using real Supabase.
//
//   const channel = bus
//     .channel("dashboard")
//     .on("postgres_changes", { event: "INSERT", table: "ledger_events" }, cb)
//     .subscribe();
//   bus.removeChannel(channel);

export type RealtimePayload =
  | { event: "INSERT"; table: string; new: any }
  | { event: "UPDATE"; table: string; new: any; old: any }
  | { event: "DELETE"; table: string; old: any }
  | { event: "AUTH_CHANGED" };

type FilterConfig = {
  event: "INSERT" | "UPDATE" | "DELETE" | "*";
  schema?: string;
  table?: string;
  filter?: string; // "col=eq.value"
};

const CHANNEL_NAME = "tasdiq-demo-bus";

let bc: BroadcastChannel | null = null;
let fallbackListeners: Array<(m: RealtimePayload) => void> = [];

function ensureChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (bc) return bc;
  if (typeof BroadcastChannel === "undefined") return null;
  bc = new BroadcastChannel(CHANNEL_NAME);
  bc.onmessage = (ev) => {
    for (const l of fallbackListeners) l(ev.data as RealtimePayload);
  };
  return bc;
}

// Publish to every tab (including this one).
export function publish(payload: RealtimePayload) {
  if (typeof window === "undefined") return;
  const ch = ensureChannel();
  if (ch) ch.postMessage(payload);
  // Also notify listeners in the current tab — BroadcastChannel does not
  // deliver a sender's own messages back to itself.
  for (const l of fallbackListeners) l(payload);
}

function subscribeAll(cb: (m: RealtimePayload) => void): () => void {
  ensureChannel();
  fallbackListeners.push(cb);
  return () => {
    fallbackListeners = fallbackListeners.filter((x) => x !== cb);
  };
}

// -------------------------------------------------------------
// Supabase-shaped channel builder
// -------------------------------------------------------------

interface OnConfig {
  type: "postgres_changes" | "auth";
  config: FilterConfig;
  cb: (payload: any) => void;
}

export class Channel {
  private handlers: OnConfig[] = [];
  private unsub: (() => void) | null = null;
  readonly topic: string;

  constructor(topic: string) {
    this.topic = topic;
  }

  on(
    type: "postgres_changes",
    config: FilterConfig,
    cb: (payload: { eventType: string; new: any; old: any; table: string }) => void
  ): this;
  on(
    type: "auth",
    config: { event: "SIGNED_IN" | "SIGNED_OUT" | "*" },
    cb: (payload: any) => void
  ): this;
  on(type: any, config: any, cb: any): this {
    this.handlers.push({ type, config, cb });
    return this;
  }

  subscribe(): this {
    this.unsub = subscribeAll((msg) => {
      for (const h of this.handlers) {
        if (h.type === "postgres_changes" && msg.event !== "AUTH_CHANGED") {
          if (!matches(msg, h.config)) continue;
          h.cb({
            eventType: msg.event,
            new: (msg as any).new,
            old: (msg as any).old,
            table: (msg as any).table,
          });
        } else if (h.type === "auth" && msg.event === "AUTH_CHANGED") {
          h.cb(msg);
        }
      }
    });
    return this;
  }

  unsubscribe() {
    this.unsub?.();
    this.unsub = null;
    this.handlers = [];
  }
}

function matches(msg: RealtimePayload, cfg: FilterConfig): boolean {
  if (msg.event === "AUTH_CHANGED") return false;
  if (cfg.event !== "*" && msg.event !== cfg.event) return false;
  if (cfg.table && (msg as any).table !== cfg.table) return false;
  if (cfg.filter) {
    const m = cfg.filter.match(/^([\w_]+)=eq\.(.+)$/);
    if (m) {
      const [, col, val] = m;
      const row = (msg as any).new ?? (msg as any).old;
      if (!row || String(row[col]) !== val) return false;
    }
  }
  return true;
}

export const bus = {
  channel(topic: string): Channel {
    return new Channel(topic);
  },
  removeChannel(ch: Channel) {
    ch.unsubscribe();
  },
};
