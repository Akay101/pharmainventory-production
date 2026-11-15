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
  purchase: { label: "Purchase agent", tone: "bg-orange-500" },
  billing: { label: "Billing agent", tone: "bg-emerald-600" },
  inventory: { label: "Inventory agent", tone: "bg-sky-600" },
  customer: { label: "Customer agent", tone: "bg-rose-600" },
  supplier: { label: "Supplier agent", tone: "bg-violet-600" },
  app: { label: "App assistant", tone: "bg-zinc-600" },
  medi: { label: "Medi expert", tone: "bg-red-600" },
};

export const inr = (n) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
