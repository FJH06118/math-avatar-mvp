import { spawn } from "node:child_process";
import net from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceDirectory = path.resolve(scriptDirectory, "..");
const frontendDirectory = path.join(workspaceDirectory, "frontend");
const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next", {
  paths: [frontendDirectory],
});
const routes = [
  "/",
  "/upload",
  "/projects/project-limit",
  "/projects/project-limit/parsing",
  "/projects/project-limit/generating",
  "/projects/project-limit/result",
];

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function getAvailablePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });

  const address = probe.address();
  if (!address || typeof address === "string") {
    throw new Error("无法分配本地路由检查端口。");
  }

  await new Promise((resolve, reject) => {
    probe.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

function waitForExit(process, timeoutMs) {
  return new Promise((resolve) => {
    if (process.exitCode !== null || process.signalCode !== null) {
      resolve(true);
      return;
    }

    const timeout = setTimeout(() => {
      process.removeListener("exit", onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    process.once("exit", onExit);
  });
}

async function stopServer(server) {
  if (server.exitCode !== null || server.signalCode !== null) {
    return;
  }

  server.kill();
  if (await waitForExit(server, 5_000)) {
    return;
  }

  server.kill("SIGKILL");
  await waitForExit(server, 5_000);
}

async function waitForServer(origin, getOutput, getExit) {
  const deadline = Date.now() + 30_000;
  let lastFailure = "尚未收到响应";

  while (Date.now() < deadline) {
    const exit = getExit();
    if (exit) {
      throw new Error(`生产服务提前退出：${exit}\n${getOutput()}`);
    }

    try {
      const response = await fetch(`${origin}/`, { redirect: "manual" });
      if (response.status === 200) {
        return;
      }
      lastFailure = `首页返回 HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    await delay(250);
  }

  throw new Error(
    `生产服务未在 30 秒内就绪：${lastFailure}\n${getOutput()}`,
  );
}

const port = await getAvailablePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [nextCli, "start", "--hostname", "127.0.0.1", "--port", String(port)],
  {
    cwd: frontendDirectory,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
let output = "";
let exit = null;
const appendOutput = (chunk) => {
  output = `${output}${chunk}`.slice(-4_000);
};

server.stdout.on("data", appendOutput);
server.stderr.on("data", appendOutput);
server.once("error", (error) => {
  exit = error.message;
});
server.once("exit", (code, signal) => {
  exit = `exit code ${code ?? "null"}, signal ${signal ?? "none"}`;
});

try {
  await waitForServer(origin, () => output, () => exit);

  for (const route of routes) {
    const response = await fetch(`${origin}${route}`, { redirect: "manual" });
    if (response.status !== 200) {
      throw new Error(`${route} 返回 HTTP ${response.status}`);
    }
  }

  console.log(`routes:check passed (${routes.length} routes)`);
} finally {
  await stopServer(server);
}
