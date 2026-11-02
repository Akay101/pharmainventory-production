const api = window.davadeskSetup;
const $ = (id) => document.getElementById(id);

if (new URLSearchParams(location.search).get("problem")) $("problem").hidden = false;

function render(state) {
  const isMain = state.mode === "main" && state.lan?.enabled;
  const isCounter = state.mode === "counter";

  $("status").textContent = isCounter
    ? `This computer is a counter, using the data on the main computer at ${state.main?.host}${state.main?.shop ? ` (${state.main.shop})` : ""}.`
    : isMain
      ? "This is the main computer. Other counters can connect to it."
      : "This computer works on its own, with its own data.";

  $("mainPanel").hidden = isCounter;
  $("connectPanel").hidden = isCounter || isMain;
  $("counterPanel").hidden = !isCounter;
  $("enableRow").hidden = isMain;
  $("mainOn").hidden = !isMain;
  $("mainTitle").textContent = isMain ? "Main computer" : "Make this the main computer";

  if (isMain) {
    $("code").textContent = state.lan.code || "Expired. Create a new code.";
    $("address").textContent = state.lan.addresses.join(", ") || "Not on a network";
    const list = $("devices");
    list.replaceChildren();
    $("devicesBlock").hidden = !state.lan.devices.length;
    for (const device of state.lan.devices) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = device.name;
      const remove = document.createElement("button");
      remove.className = "danger";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => run(() => api.revoke(device.id)));
      li.append(name, remove);
      list.append(li);
    }
  }
}

async function run(action) {
  try {
    render(await action());
  } catch (err) {
    $("connectError").textContent = cleanError(err);
    $("connectError").hidden = false;
  }
}

// Electron prefixes messages from the main process with internal details
const cleanError = (err) => String(err.message || err).replace(/^Error invoking remote method '[^']*': (Error: )?/, "");

$("enableMain").addEventListener("click", () => run(api.enableMain));
$("disableMain").addEventListener("click", () => run(api.disableMain));
$("newCode").addEventListener("click", () => run(api.newCode));
$("retry").addEventListener("click", () => {
  $("problem").hidden = true;
  run(api.retry);
});
$("disconnect").addEventListener("click", () => {
  $("problem").hidden = true;
  run(api.disconnect);
});

$("search").addEventListener("click", async () => {
  $("search").disabled = true;
  $("searchNote").textContent = "Searching…";
  const list = $("found");
  list.replaceChildren();
  try {
    const found = await api.discover();
    $("searchNote").textContent = found.length ? "" : "None found. Enter the address shown on the main computer.";
    for (const item of found) {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${item.name} on ${item.computer} (${item.host})`;
      const use = document.createElement("button");
      use.textContent = "Use";
      use.addEventListener("click", () => {
        $("host").value = item.host;
        $("pin").focus();
      });
      li.append(label, use);
      list.append(li);
    }
  } catch (err) {
    $("searchNote").textContent = cleanError(err);
  }
  $("search").disabled = false;
});

$("connect").addEventListener("click", async () => {
  const host = $("host").value.trim();
  const code = $("pin").value.trim();
  $("connectError").hidden = true;
  if (!host || !/^\d{6}$/.test(code)) {
    $("connectError").textContent = "Enter the address and the 6-digit code from the main computer.";
    $("connectError").hidden = false;
    return;
  }
  $("connect").disabled = true;
  await run(() => api.connect(host, code));
  $("connect").disabled = false;
});

run(api.state);
