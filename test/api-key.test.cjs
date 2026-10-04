const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { inspect } = require("node:util");
const vm = require("node:vm");
const { test } = require("node:test");

const root = join(__dirname, "..");
const secret = "personal-key-test-sentinel";
const source = (file) => readFileSync(join(root, file), "utf8");
const stripImports = (text) => text.replace(/^import .*;\s*$/gm, "");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function loadClient(config) {
  const requests = [];
  const code = stripImports(source("src/opensub.js")).replace(
    /export class /g,
    "class "
  );
  const { Client } = vm.runInNewContext(`${code}\n({ Client });`, {
    console: { log() {}, error() {} },
    iina: { postMessage() {} },
    METHODS: JSON.parse(source("src/methods.json")),
    rpcClient: function () {
      return {
        $getAPIConfig: () => config,
        $getJWT: async () => undefined,
        $setJWT: async () => true,
        $downloadFile: async () => {},
      };
    },
    axios: async (request) => {
      requests.push(request);
      return {
        status: 200,
        data: request.url.endsWith("/login")
          ? { token: "test-token", user: {} }
          : request.url.endsWith("/download")
          ? { link: "https://example.invalid/test.srt", file_name: "test.srt" }
          : { data: [] },
      };
    },
    setTimeout,
  });
  return { client: new Client(), requests };
}

test("requests wait for the selected key to load", async () => {
  const config = deferred();
  const { client, requests } = loadClient(config.promise);
  const search = client.search({ query: "Test subtitle" });
  await Promise.resolve();
  assert.equal(requests.length, 0);
  config.resolve({ personalAPIKeyEnabled: true, apiKey: secret });
  await search;
  assert.equal(requests[0].headers["Api-Key"], secret);
  const info = await client.getConnectionInfo();
  assert.equal(info.personalAPIKeyEnabled, true);
  assert.equal(info.error, null);
  assert.equal(info.apiKey, undefined, "The UI receives status, not the key");
});

test("shared mode retains the default key", async () => {
  const { client, requests } = loadClient(
    Promise.resolve({ personalAPIKeyEnabled: false })
  );
  const defaultKey = client.api.headers["Api-Key"];
  await client.search({ query: "Test subtitle" });
  assert.equal(requests[0].headers["Api-Key"], defaultKey);
  assert.notEqual(defaultKey, secret);
  assert.equal((await client.getConnectionInfo()).personalAPIKeyEnabled, false);
});

test("login and downloads use the selected key", async () => {
  const { client, requests } = loadClient(
    Promise.resolve({ personalAPIKeyEnabled: true, apiKey: secret })
  );
  await client.login("test-user", "test-password");
  await client.download([1]);
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => request.headers["Api-Key"] === secret));
});

test("missing selected keys fail without sending a shared-key request", async () => {
  for (const apiKey of [null, false, ""]) {
    const { client, requests } = loadClient(
      Promise.resolve({ personalAPIKeyEnabled: true, apiKey })
    );
    await assert.rejects(
      client.search({ query: "Test subtitle" }),
      /Could not read your personal API key/
    );
    assert.equal(requests.length, 0);
    assert.ok((await client.getConnectionInfo()).error);
  }
});

test("configuration RPC failures are surfaced without fallback", async () => {
  const config = deferred();
  const { client, requests } = loadClient(config.promise);
  const search = client.search({ query: "Test subtitle" });
  config.reject(new Error("Keychain unavailable"));
  await assert.rejects(search, /Could not load your API key configuration/);
  assert.equal(requests.length, 0);
});

function loadNative({
  input = secret,
  enabled = false,
  storedKey = secret,
  saveOK = true,
  saveLogin = "keychain",
} = {}) {
  const events = new Map();
  const menuItems = [];
  const values = new Map([
    ["personal_api_key_enabled", enabled],
    ["username", "old-user"],
    ["save_login", saveLogin],
  ]);
  const writes = [];
  const reads = [];
  const messages = [];
  const notifications = [];
  const logs = [];
  let synced = 0;
  const code = stripImports(source("src/index.js")).replace(
    "export const rpc",
    "const rpc"
  );
  const rpc = vm.runInNewContext(`${code}\nrpc;`, {
    global: {},
    register() {},
    rpcClient: () => ({}),
    iina: {
      console: { log: (...args) => logs.push(inspect(args)), error() {} },
      core: {
        getVersion: () => ({ build: "180" }),
        window: { visible: true },
        osd: (message) => notifications.push(message),
      },
      menu: {
        removeAllItems() {},
        item: (name, callback) => ({ name, callback }),
        addItem: (item) => menuItems.push(item),
      },
      preferences: {
        get: (name) => values.get(name),
        set: (name, value) => values.set(name, value),
        sync: () => {
          synced++;
        },
      },
      event: { on: (name, callback) => events.set(name, callback) },
      sidebar: {
        loadFile() {},
        onMessage() {},
        postMessage: (name, data) => messages.push({ name, data }),
        show() {},
      },
      utils: {
        prompt: () => input,
        keychainWrite: (...args) => {
          writes.push(args);
          return saveOK;
        },
        keychainRead: (...args) => {
          reads.push(args);
          return storedKey;
        },
      },
    },
  });
  events.get("iina.window-loaded")();
  events.get("iina.menu-update")();
  const configure = menuItems.find(
    (item) => item.name === "Personal API Key…"
  ).callback;
  return {
    rpc,
    configure,
    values,
    writes,
    reads,
    messages,
    notifications,
    logs,
    syncCount: () => synced,
  };
}

test("native menu stores keys only in Keychain and clears the prior identity", () => {
  const fixture = loadNative({ input: `  ${secret}  `, saveLogin: "no" });
  fixture.configure();
  assert.equal(fixture.writes[0][0], "opensubtitles-api");
  assert.equal(fixture.writes[0][1], "personal");
  assert.equal(fixture.writes[0][2], secret);
  assert.equal(fixture.values.get("personal_api_key_enabled"), true);
  assert.equal(fixture.values.get("username"), "");
  assert.equal(fixture.syncCount(), 1);
  assert.ok(fixture.messages.some(({ name }) => name === "api-config-changed"));
  assert.ok(!inspect([...fixture.values]).includes(secret));
  assert.ok(!fixture.logs.join("\n").includes(secret));
  assert.ok(!inspect(fixture.messages).includes(secret));
});

test("canceling key entry changes nothing", () => {
  const fixture = loadNative({ input: null });
  fixture.configure();
  assert.equal(fixture.writes.length, 0);
  assert.equal(fixture.syncCount(), 0);
  assert.equal(fixture.values.get("username"), "old-user");
});

test("blank key entry restores shared mode", () => {
  const fixture = loadNative({ input: "  ", enabled: true });
  fixture.configure();
  assert.equal(fixture.values.get("personal_api_key_enabled"), false);
  assert.equal(fixture.values.get("username"), "");
  assert.equal(fixture.writes.length, 0);
  assert.ok(fixture.notifications[0].includes("shared"));
});

test("failed Keychain writes retain the previous configuration", () => {
  const fixture = loadNative({ saveOK: false });
  fixture.configure();
  assert.equal(fixture.values.get("personal_api_key_enabled"), false);
  assert.equal(fixture.values.get("username"), "old-user");
  assert.equal(fixture.syncCount(), 0);
  assert.ok(fixture.notifications[0].includes("Could not save"));
});

test("shared-mode configuration does not read the personal Keychain item", () => {
  const fixture = loadNative({ saveLogin: "no" });
  assert.equal(fixture.rpc.$getAPIConfig().personalAPIKeyEnabled, false);
  assert.equal(fixture.reads.length, 0);
});

test("personal keys load independently of the login persistence preference", () => {
  const fixture = loadNative({ enabled: true, saveLogin: "no" });
  const config = fixture.rpc.$getAPIConfig();
  assert.equal(config.personalAPIKeyEnabled, true);
  assert.equal(config.apiKey, secret);
  assert.equal(fixture.reads[0][0], "opensubtitles-api");
});

test("the sidebar shows personal-key status and updates anonymous download quota", async () => {
  const script = source("ui/sidebar/app.vue").match(
    /<script>([\s\S]*?)<\/script>/
  )[1];
  const component = vm.runInNewContext(
    stripImports(script).replace("export default", "const component =") +
      "\ncomponent;",
    {
      console: { log() {}, error() {} },
      global: {},
      setTimeout() {},
      client: {
        getConnectionInfo: async () => ({
          personalAPIKeyEnabled: true,
          error: null,
        }),
        download: async () => ({ requests: 1, remaining: 4, message: "OK" }),
      },
      rpc: { $getLanguages: async () => "", $sendOSD() {} },
      FontAwesomeIcon: {},
      ModalPopup: {},
      SubInfo: {},
    }
  );
  const ctx = component.data();
  for (const [name, method] of Object.entries(component.methods))
    ctx[name] = method.bind(ctx);
  component.mounted.call(ctx);
  await Promise.resolve();
  assert.equal(ctx.personalAPIKeyEnabled, true);
  assert.equal(ctx.apiConfigurationError, null);
  await ctx.download({
    id: 1,
    attributes: { release: "Test subtitle", files: [{ file_id: 1 }] },
  });
  assert.equal(ctx.userInfo, null);
  assert.equal(ctx.quotaInfo.remaining, 4);
});
