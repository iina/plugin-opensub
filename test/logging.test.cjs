const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { inspect } = require("node:util");
const vm = require("node:vm");
const { test } = require("node:test");

const root = join(__dirname, "..");
const secrets = {
  password: "test-password-sentinel",
  apiKey: "test-api-key-sentinel",
  jwt: "test-jwt-sentinel",
  link: "https://example.invalid/test-download-link-sentinel",
};
const source = (file) => readFileSync(join(root, file), "utf8");
const stripImports = (text) => text.replace(/^import .*;\s*$/gm, "");

function capture() {
  const lines = [];
  const record = (...args) => lines.push(inspect(args, { depth: null }));
  return {
    lines,
    console: { log: record, error: record },
    postMessage(name, value) {
      if (name === "error") record(value);
    },
    assertNoSecrets() {
      for (const secret of Object.values(secrets)) {
        assert.ok(!lines.join("\n").includes(secret), "Logs contain a secret");
      }
    },
  };
}

function loadAPI(logs, axios, rpcClient = function () {}) {
  const code = stripImports(source("src/opensub.js")).replace(
    /export class /g,
    "class "
  );
  return vm.runInNewContext(`${code}\n({ API, Client });`, {
    axios,
    METHODS: JSON.parse(source("src/methods.json")),
    rpcClient,
    console: logs.console,
    iina: { postMessage: logs.postMessage },
    setTimeout,
  });
}

test("API logs omit credentials while requests still send them", async () => {
  const logs = capture();
  const requests = [];
  const { API } = loadAPI(logs, async (request) => {
    requests.push(request);
    return { status: 200, data: {} };
  });
  const api = new API(secrets.apiKey);
  await api.user.login({ username: "test-user", password: secrets.password });
  await api.infos.user({}, secrets.jwt);
  assert.equal(requests[0].data.password, secrets.password);
  assert.equal(requests[0].headers["Api-Key"], secrets.apiKey);
  assert.equal(requests[1].headers.Authorization, `Bearer ${secrets.jwt}`);
  assert.ok(logs.lines.some((line) => line.includes("/login")));
  logs.assertNoSecrets();
});

test("HTTP failure logs omit Axios config and request objects", async () => {
  for (const kind of ["response", "request", "setup"]) {
    const logs = capture();
    const config = {
      headers: { "Api-Key": secrets.apiKey, Authorization: secrets.jwt },
      data: { password: secrets.password },
    };
    const error =
      kind === "response"
        ? {
            response: {
              status: 503,
              config,
              request: config,
              data: { message: "Service unavailable", token: secrets.jwt },
            },
          }
        : kind === "request"
        ? { request: config }
        : { message: "Request setup failed", config };
    const { API } = loadAPI(logs, async () => {
      throw error;
    });
    await assert.rejects(
      new API(secrets.apiKey).user.login({
        username: "test-user",
        password: secrets.password,
      })
    );
    assert.ok(logs.lines.some((line) => line.includes("/login")));
    if (kind === "response") {
      assert.ok(logs.lines.some((line) => line.includes("503")));
    }
    logs.assertNoSecrets();
  }
});

test("cached sessions, login and download responses are not logged", async () => {
  const logs = capture();
  let savedToken;
  let downloadedLink;
  const { Client } = loadAPI(
    logs,
    async (request) => ({
      status: 200,
      config: { data: { password: secrets.password } },
      data: request.url.endsWith("/download")
        ? { link: secrets.link, file_name: "test.srt" }
        : { token: secrets.jwt, user: { user_id: 1 } },
    }),
    function () {
      return {
        $getAPIConfig: async () => ({ personalAPIKeyEnabled: false }),
        $getJWT: async () => ({ jwt: secrets.jwt, username: "test-user" }),
        $setJWT: (username, token) => {
          savedToken = token;
          return true;
        },
        $downloadFile: async (items) => {
          downloadedLink = items[0].link;
        },
      };
    }
  );
  const client = new Client({ api_key: secrets.apiKey });
  await Promise.resolve();
  const result = await client.login("test-user", secrets.password);
  assert.equal(result.token, secrets.jwt);
  assert.equal(savedToken, secrets.jwt);
  assert.ok(client.loggedIn);
  const download = await client.download([1]);
  assert.equal(download.link, secrets.link);
  assert.equal(downloadedLink, secrets.link);
  logs.assertNoSecrets();
});

test("RPC logs omit arguments and results without changing delivery", async () => {
  const logs = capture();
  const { rpcClient } = vm.runInNewContext(
    source("src/message.js").replace("export function", "function") +
      "\n({ rpcClient });",
    { console: logs.console }
  );
  const handlers = new Map();
  const transport = {
    onMessage(name, callback) {
      handlers.set(name, callback);
    },
    postMessage(name, payload) {
      handlers.get(name)?.(payload);
    },
  };
  const server = rpcClient(transport);
  const client = rpcClient(transport);
  server.$setJWT = (password, apiKey, jwt) => {
    assert.equal(password, secrets.password);
    assert.equal(apiKey, secrets.apiKey);
    return jwt;
  };
  assert.equal(
    await client.$setJWT(secrets.password, secrets.apiKey, secrets.jwt),
    secrets.jwt
  );
  assert.ok(
    logs.lines.some((line) => line.includes("RPC got response: $setJWT"))
  );
  logs.assertNoSecrets();
});

test("sidebar state, login and download logs omit secret payloads", async () => {
  const logs = capture();
  const script = source("ui/sidebar/app.vue").match(
    /<script>([\s\S]*?)<\/script>/
  )[1];
  const callbacks = [];
  const component = vm.runInNewContext(
    stripImports(script).replace("export default", "const component =") +
      "\ncomponent;",
    {
      console: logs.console,
      global: {},
      setTimeout: (callback) => callbacks.push(callback),
      client: {
        loggedIn: true,
        getConnectionInfo: async () => ({
          personalAPIKeyEnabled: false,
          error: null,
        }),
        username: "test-user",
        login: async (username, password) => {
          assert.equal(username, "test-user");
          assert.equal(password, secrets.password);
          return { token: secrets.jwt, user: { user_id: 1 }, jwtSaved: true };
        },
        download: async () => ({
          link: secrets.link,
          requests: 1,
          remaining: 4,
          message: "OK",
        }),
      },
      rpc: { $getLanguages: async () => "", $sendOSD() {} },
      ModalPopup: {},
      FontAwesomeIcon: {},
      SubInfo: {},
    }
  );
  const ctx = component.data();
  for (const [name, method] of Object.entries(component.methods)) {
    ctx[name] = method.bind(ctx);
  }
  ctx.loginUsername = "test-user";
  ctx.loginPassword = secrets.password;
  component.mounted.call(ctx);
  callbacks.forEach((callback) => callback());
  await ctx.performLogin();
  await ctx.download({
    id: 1,
    attributes: {
      release: "Test subtitle",
      files: [{ file_id: 1 }],
    },
  });
  assert.equal(ctx.loginPassword, "");
  assert.equal(ctx.quotaInfo.remaining, 4);
  logs.assertNoSecrets();
});

test("native downloads omit access links from logs", async () => {
  const logs = capture();
  const events = new Map();
  let requestedLink;
  const rpc = vm.runInNewContext(
    stripImports(source("src/index.js")).replace(
      "export const rpc",
      "const rpc"
    ) + "\nrpc;",
    {
      global: {},
      register() {},
      rpcClient: () => ({}),
      iina: {
        console: logs.console,
        core: {
          getVersion: () => ({ build: "180" }),
          subtitle: { loadTrack() {} },
        },
        preferences: { get: () => null },
        utils: { resolvePath: (p) => p },
        event: { on: (name, callback) => events.set(name, callback) },
        sidebar: { loadFile() {}, onMessage() {}, postMessage() {} },
        http: {
          download: async (link) => {
            requestedLink = link;
          },
        },
      },
    }
  );
  events.get("iina.window-loaded")();
  await rpc.$downloadFile([{ link: secrets.link, file_name: "test.srt" }]);
  assert.equal(requestedLink, secrets.link);
  assert.ok(logs.lines.some((line) => line.includes("test.srt")));
  logs.assertNoSecrets();
});
