import axios from "axios";
import { API, getAccessToken, refreshAccessToken } from "../../App";

// Streams one assistant turn. `body` is {conversation_id?, message} or
// {conversation_id, action, label}. Calls onEvent(name, data) per SSE event.
// Photos (File[]) go as multipart; everything else as JSON.
export async function streamTurn(body, { onEvent, signal, files = [] }) {
  const payload = () => {
    if (!files.length) return { headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    const fd = new FormData();
    Object.entries(body).forEach(([k, v]) => v !== undefined && v !== null && fd.append(k, typeof v === "object" ? JSON.stringify(v) : String(v)));
    files.forEach((f) => fd.append("files", f));
    return { headers: {}, body: fd };
  };
  const send = () => {
    const p = payload();
    return fetch(`${API}/assistant/chat`, {
      method: "POST",
      headers: { ...p.headers, authorization: `Bearer ${getAccessToken()}` },
      body: p.body,
      credentials: "include",
      signal,
    });
  };
  let res = await send();
  if (res.status === 401) {
    await refreshAccessToken();
    res = await send();
  }
  if (!res.ok || !res.body) {
    let detail = "Couldn't reach the assistant";
    try {
      detail = (await res.json()).detail || detail;
    } catch {}
    if (res.status === 403) detail = "Your plan doesn't include the assistant right now.";
    throw new Error(detail);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const handle = (raw) => {
    const name = raw.match(/^event: (.*)$/m)?.[1];
    const data = raw.match(/^data: (.*)$/m)?.[1];
    if (!name || !data) return;
    try {
      onEvent(name, JSON.parse(data));
    } catch {}
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      handle(buf.slice(0, i));
      buf = buf.slice(i + 2);
    }
  }
  if (buf.trim()) handle(buf);
}

export const assistantApi = {
  list: (params) => axios.get(`${API}/assistant/conversations`, { params }).then((r) => r.data),
  get: (id) => axios.get(`${API}/assistant/conversations/${id}`).then((r) => r.data),
  update: (id, patch) => axios.patch(`${API}/assistant/conversations/${id}`, patch),
  remove: (id) => axios.delete(`${API}/assistant/conversations/${id}`),
  removeAll: () => axios.delete(`${API}/assistant/conversations`),
  feedback: (messageId, value) => axios.post(`${API}/assistant/messages/${messageId}/feedback`, { value }),
  lookup: (kind, q) => axios.get(`${API}/assistant/lookup`, { params: { kind, q } }).then((r) => r.data),
};

export const AGENT_META = {
  purchase: { label: "Purchase agent", tone: "from-orange-500 to-amber-500" },
  billing: { label: "Billing agent", tone: "from-emerald-500 to-teal-500" },
  inventory: { label: "Inventory agent", tone: "from-sky-500 to-blue-500" },
  customer: { label: "Customer agent", tone: "from-pink-500 to-rose-500" },
  supplier: { label: "Supplier agent", tone: "from-violet-500 to-purple-500" },
  app: { label: "App assistant", tone: "from-slate-500 to-zinc-500" },
  medi: { label: "Medi expert", tone: "from-red-500 to-pink-500" },
};

export const inr = (n) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
