import axios from "axios";
import { API } from "../../App";

// Shrinks a photo in the browser before upload: phone photos are 3-12 MB, the
// AI needs ~1-2 MP. Cuts upload time on mobile data dramatically.
export function compressForScan(file, { maxSide = 1800, quality = 0.82 } = {}) {
  return new Promise((resolve) => {
    if (!file || !file.type?.startsWith("image/")) return resolve(file);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) =>
          resolve(
            blob && blob.size < file.size
              ? new File([blob], (file.name || "photo").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg", lastModified: Date.now() })
              : file
          ),
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

const toForm = (files) => {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  return fd;
};

// Billing: read one pack and match it to stock in a single request
export async function scanPackForBilling(files, { signal } = {}) {
  const res = await axios.post(`${API}/bills/scan-product`, toForm(files), { signal, timeout: 70000 });
  return res.data;
}

// Purchases: queue a product/invoice scan; resolves with the finished job
export async function runQueuedScan(type, files, { signal, onUpdate } = {}) {
  const path = type === "bill" ? "/purchases/scan-bill" : "/purchases/scan-image";
  const start = await axios.post(`${API}${path}`, toForm(files), { signal, timeout: 60000 });
  if (start.data.status === "completed" && start.data.result) {
    return { ...start.data, cached: true };
  }
  const jobId = start.data.jobId;
  const deadline = Date.now() + 3 * 60 * 1000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    // Server holds the request open until the scan finishes (up to ~20s)
    const { data } = await axios.get(`${API}/purchases/scan-status/${jobId}?wait=1`, { signal, timeout: 30000 });
    onUpdate?.(data);
    if (data.status === "completed") return data;
    if (data.status === "failed") throw Object.assign(new Error(data.errorMessage || "Scan failed"), { scanFailed: true });
  }
  throw new Error("The scan is taking longer than usual. Please try again.");
}

export function scanErrorMessage(err) {
  if (axios.isCancel?.(err) || err?.name === "AbortError" || err?.name === "CanceledError") return null;
  return err?.response?.data?.detail || err?.message || "Scan failed. Please try again.";
}

export const MATCH_META = {
  batch_exact: { label: "Batch match", tone: "emerald", hint: "Batch found in your stock" },
  batch_similar: { label: "Batch match", tone: "emerald", hint: "Batch matched (allowing for a misread character)" },
  name_matched: { label: "Matched by name", tone: "sky", hint: "Batch not found, matched the product by name" },
  negative_billing: { label: "Not in stock", tone: "amber", hint: "Will be billed as negative stock" },
};
