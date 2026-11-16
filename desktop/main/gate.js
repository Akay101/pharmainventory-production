const gate = window.davadeskGate;
const $ = (id) => document.getElementById(id);

const COPY = {
  not_signed_in: ["Welcome to DavaDesk", "Sign in with your DavaDesk account. An active subscription is needed. This needs internet once; after that you can work offline."],
  revoked: ["Please sign in again", "This computer's sign-in has ended, for example after a password change or because it was removed from the account. Unsent work is kept safe."],
  expired: ["Your subscription isn't active", "Renew your subscription in your browser, then sign in here. Unsent work still reaches the cloud."],
  licence_expired: ["Please connect to the internet", "DavaDesk has been offline for too long and needs to confirm your subscription. Your work is safe and will sync once connected."],
  clock: ["Check this computer's date and time", "The computer's clock looks wrong. Set the correct date and time to continue."],
  first_copy: ["Setting up your shop", "Getting your data from the cloud. This happens once."],
  catalog: ["Downloading medicines, doctors and distributors", "This lets search work with no internet. It happens once and may take several minutes, depending on your connection."],
  update_required: ["Please update DavaDesk", "This version is too old to keep working with your account. Your work is safe and syncs after the update."],
};

const cleanError = (err) => String(err.message || err).replace(/^Error invoking remote method '[^']*': (Error: )?/, "");
const showError = (text) => {
  $("error").textContent = text;
  $("error").hidden = false;
  $("waiting").hidden = true;
};

async function refresh() {
  try {
    const s = await gate.state();
    const problem = s.update?.required ? "update_required" : s.access_problem || (s.setup_pending ? "catalog" : "first_copy");
    const [title, message] = COPY[problem] || COPY.not_signed_in;
    $("title").textContent = title;
    $("message").textContent = message;
    const copying = problem === "first_copy" || problem === "catalog";
    const signInHidden = copying || problem === "clock" || problem === "update_required";
    $("copying").hidden = !copying;
    $("signIn").hidden = signInHidden;
    $("manual").hidden = signInHidden;
    $("counters").hidden = problem !== "not_signed_in";
    $("update").hidden = problem !== "update_required";
    $("update").textContent = s.update?.status === "ready" ? "Restart to update" : s.update?.status === "downloading" ? "Downloading the update…" : "Download the update";
    $("update").disabled = s.update?.status === "downloading";
    $("continueSetup").hidden = problem !== "catalog";
    if (problem === "catalog") {
      const c = s.catalog || {};
      $("copyLabel").textContent = !s.online ? "Waiting for internet. It continues by itself." : c.total ? `${c.done.toLocaleString("en-IN")} of ${c.total.toLocaleString("en-IN")} entries` : "Starting…";
      $("copyBar").style.width = c.total ? `${Math.round((c.done / c.total) * 100)}%` : "0";
    } else if (copying) {
      const p = s.progress;
      $("copyLabel").textContent = !s.online ? "Waiting for internet…" : p ? `${p.label}: ${p.done} of ${p.total}` : "Starting…";
      $("copyBar").style.width = p && p.total ? `${Math.round((p.done / p.total) * 100)}%` : "0";
    }
  } catch {}
}

$("signIn").addEventListener("click", async () => {
  $("error").hidden = true;
  $("waiting").hidden = false;
  try {
    await gate.signIn();
  } catch (err) {
    showError(cleanError(err));
  }
});
$("submit").addEventListener("click", async () => {
  $("error").hidden = true;
  try {
    await gate.submitCode($("code").value);
  } catch (err) {
    showError(cleanError(err));
  }
});
$("counters").addEventListener("click", () => gate.openCounters());
$("continueSetup").addEventListener("click", () => gate.continueSetup());
$("update").addEventListener("click", () => gate.applyUpdate());
gate.onError(showError);

refresh();
setInterval(refresh, 1000);
