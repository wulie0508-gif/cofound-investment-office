import { execFileSync } from "node:child_process";
import { fetch, ProxyAgent, type Dispatcher, type RequestInit } from "undici";

let dispatcher: Dispatcher | undefined;
let resolved = false;

function registryValue(name: "ProxyEnable" | "ProxyServer") {
  try {
    const output = execFileSync(
      "reg.exe",
      [
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        name,
      ],
      { encoding: "utf8", windowsHide: true, timeout: 2_000 }
    );
    const line = output
      .split(/\r?\n/u)
      .find(candidate => candidate.trimStart().startsWith(name));
    return line
      ?.trim()
      .split(/\s{2,}/u)
      .at(-1)
      ?.trim();
  } catch {
    return undefined;
  }
}

function normalizeProxy(value: string | undefined) {
  if (!value) return undefined;
  const entries = value.split(";").map(item => item.trim());
  const httpsEntry = entries.find(item => /^https=/iu.test(item));
  const selected = (httpsEntry ?? entries[0]).replace(/^https?=/iu, "");
  if (!selected) return undefined;
  return /^https?:\/\//iu.test(selected) ? selected : `http://${selected}`;
}

function proxyUrl() {
  const fromEnvironment =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy;
  if (fromEnvironment) return normalizeProxy(fromEnvironment);
  if (process.platform !== "win32") return undefined;
  const enabled = registryValue("ProxyEnable");
  if (!enabled || !/0x1|\b1$/u.test(enabled)) return undefined;
  return normalizeProxy(registryValue("ProxyServer"));
}

function remoteDispatcher() {
  if (resolved) return dispatcher;
  resolved = true;
  const proxy = proxyUrl();
  if (proxy) dispatcher = new ProxyAgent(proxy);
  return dispatcher;
}

export function remoteFetch(url: string, init: RequestInit) {
  return fetch(url, { ...init, dispatcher: remoteDispatcher() });
}
