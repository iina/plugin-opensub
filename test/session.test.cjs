const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = join(__dirname, "..");
const source = (file) => readFileSync(join(root, file), "utf8");
const stripImports = (text) => text.replace(/^import .*;\s*$/gm, "");
const silentConsole = { log() {}, error() {} };
const response = (data) => ({ status: 200, data });
const failure = (status, data = {}) => ({ response: { status, data } });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function loadClient({ cached = Promise.resolve(), request, save } = {}) {
  const requests = [];
  const saved = [];
  const downloads = [];
  const code = stripImports(source("src/opensub.js")).replace(
    /export class /g,
    "class "
  );
  const { Client } = vm.runInNewContext(`${code}\n({ Client });`, {
    console: silentConsole,
    iina: { postMessage() {} },
    METHODS: JSON.parse(source("src/methods.json")),
    axios: async (options) => {
      requests.push(options);
      return request(options);
    },
    rpcClient: function () {
      return {
        $getJWT: () => cached,
        $setJWT: async (username, token) => {
          saved.push({ username, token });
          return save ? save(username, token) : true;
        },
        $downloadFile: async (items) => downloads.push(...items),
      };
    },
    setTimeout,
  });
  return { client: new Client(), requests, saved, downloads };
}

test("authenticated requests wait for saved credentials", async () => {
  const cached = deferred();
  const fixture = loadClient({
    cached: cached.promise,
    request: async () => response({ data: { user_id: 1 } }),
  });
  const info = fixture.client.getUserInfo();
  // Attach a handler immediately: the base implementation rejects before loading.
  info.catch(() => {});
  await Promise.resolve();
  assert.equal(fixture.requests.length, 0);
  cached.resolve({ jwt: "cached-token", username: "test-user" });
  const result = await info;
  assert.equal(result.data.user_id, 1);
  assert.equal(
    fixture.requests[0].headers.Authorization,
    "Bearer cached-token"
  );
  assert.equal(fixture.client.username, "test-user");
});

test("a missing saved session permits anonymous requests", async () => {
  const fixture = loadClient({ request: async () => response({ data: [] }) });
  await fixture.client.search({ query: "Test movie" });
  assert.equal(fixture.client.loggedIn, false);
  assert.equal(fixture.requests[0].headers.Authorization, undefined);
});

test("a failed saved-session read permits anonymous requests", async () => {
  const cached = deferred();
  const fixture = loadClient({
    cached: cached.promise,
    request: async () => response({ data: [] }),
  });
  const search = fixture.client.search({ query: "Test movie" });
  cached.reject(new Error("Keychain unavailable"));
  await search;
  assert.equal(fixture.client.loggedIn, false);
  assert.equal(fixture.requests[0].headers.Authorization, undefined);
});

test("login waits for verification and persistence before reporting success", async () => {
  const cached = deferred();
  const verified = deferred();
  const persisted = deferred();
  const fixture = loadClient({
    cached: cached.promise,
    request: async (req) =>
      req.url.endsWith("/login")
        ? response({
            token: "new-token",
            user: { user_id: 2 },
            base_url: "vip-api.opensubtitles.com",
          })
        : verified.promise,
    save: () => persisted.promise,
  });
  const login = fixture.client.login("new-user", "test-password");
  await Promise.resolve();
  assert.equal(fixture.requests.length, 0);
  cached.resolve({ jwt: "old-token", username: "old-user" });
  await new Promise(setImmediate);
  assert.equal(fixture.requests.length, 2);
  assert.equal(
    fixture.requests[1].url,
    "https://vip-api.opensubtitles.com/api/v1/infos/user"
  );
  assert.equal(fixture.requests[1].headers.Authorization, "Bearer new-token");
  assert.equal(fixture.saved.length, 0);
  verified.resolve(response({ data: { user_id: 2 } }));
  await new Promise(setImmediate);
  assert.equal(fixture.saved[0].token, "new-token");
  assert.equal(fixture.client.username, "old-user");
  persisted.resolve(false);
  const result = await login;
  assert.equal(result.jwtSaved, false);
  assert.equal(fixture.client.username, "new-user");
  assert.equal(fixture.client.loggedIn, true);
});

test("a returned token rejected by user-info is never saved", async () => {
  const fixture = loadClient({
    cached: Promise.resolve({ jwt: "old-token", username: "old-user" }),
    request: async (req) => {
      if (req.url.endsWith("/login"))
        return response({ token: "invalid-token", user: {} });
      throw failure(401, { errors: ["Invalid token"] });
    },
  });
  await assert.rejects(
    fixture.client.login("test-user", "test-password"),
    (err) =>
      err.code === 401 &&
      /returned a session token but rejected it/.test(err.message)
  );
  assert.equal(fixture.client.loggedIn, false);
  assert.equal(fixture.client.username, null);
  assert.equal(fixture.saved.length, 1);
  assert.equal(fixture.saved[0].token, null);
});

test("rejected credentials surface the login error without token verification", async () => {
  for (const status of [400, 401]) {
    const fixture = loadClient({
      request: async () => {
        throw failure(status, { message: "Invalid login or password" });
      },
    });
    await assert.rejects(
      fixture.client.login("test-user", "wrong-password"),
      (err) =>
        err.code === status && err.message.includes("Invalid login or password")
    );
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.client.loggedIn, false);
    assert.ok(fixture.saved.every(({ token }) => token === null));
  }
});

test("verification outages are not reported as invalid credentials", async () => {
  const fixture = loadClient({
    request: async (req) => {
      if (req.url.endsWith("/login"))
        return response({ token: "unverified-token", user: {} });
      throw failure(503, { message: "Service unavailable" });
    },
  });
  await assert.rejects(
    fixture.client.login("test-user", "test-password"),
    (err) => err.code === 503 && err.message.includes("Service unavailable")
  );
  assert.equal(fixture.saved.length, 0);
  assert.equal(fixture.client.loggedIn, false);
});

test("verification rate limits do not repeat the credential login", async () => {
  const fixture = loadClient({
    request: async (req) => {
      if (req.url.endsWith("/login"))
        return response({ token: "unverified-token", user: {} });
      throw failure(429, { message: "Verification rate limit" });
    },
  });
  await assert.rejects(
    fixture.client.login("test-user", "test-password"),
    (err) => err.code === 429
  );
  assert.equal(fixture.requests.length, 2);
  assert.equal(fixture.saved.length, 0);
});

test("login responses without a token cannot create a session", async () => {
  for (const token of [undefined, null, ""]) {
    const fixture = loadClient({
      request: async () => response({ token, user: {} }),
    });
    await assert.rejects(
      fixture.client.login("test-user", "test-password"),
      /did not return a session token/
    );
    assert.equal(fixture.client.loggedIn, false);
    assert.ok(fixture.saved.every(({ token }) => token === null));
  }
});

test("expired cached tokens are cleared before requesting downloads", async () => {
  const fixture = loadClient({
    cached: Promise.resolve({ jwt: "expired-token", username: "test-user" }),
    request: async () => {
      throw failure(401, { errors: ["Invalid token"] });
    },
  });
  await assert.rejects(fixture.client.download([1]), (err) => err.code === 401);
  assert.equal(fixture.requests.length, 1);
  assert.ok(fixture.requests[0].url.endsWith("/infos/user"));
  assert.equal(fixture.saved[0].token, null);
  assert.equal(fixture.client.username, null);
  assert.equal(fixture.downloads.length, 0);
});

test("valid cached and anonymous sessions can download", async () => {
  for (const cached of [
    undefined,
    { jwt: "cached-token", username: "test-user" },
  ]) {
    const fixture = loadClient({
      cached: Promise.resolve(cached),
      request: async (req) =>
        response(
          req.url.endsWith("/download")
            ? {
                link: "https://example.invalid/test.srt",
                file_name: "test.srt",
              }
            : { data: { user_id: 1 } }
        ),
    });
    await fixture.client.download([1]);
    const request = fixture.requests.find((req) =>
      req.url.endsWith("/download")
    );
    assert.equal(
      request.headers.Authorization,
      cached ? "Bearer cached-token" : undefined
    );
    assert.equal(fixture.downloads[0].file_name, "test.srt");
  }
});

test("logout clears saved identity even when the remote request fails", async () => {
  const fixture = loadClient({
    cached: Promise.resolve({ jwt: "cached-token", username: "test-user" }),
    request: async () => {
      throw failure(503, { message: "Unavailable" });
    },
  });
  await assert.rejects(fixture.client.logout());
  assert.equal(fixture.client.loggedIn, false);
  assert.equal(fixture.client.username, null);
  assert.equal(fixture.saved[0].token, null);
});

test("native session clearing disables reloading the old keychain identity", () => {
  const events = new Map();
  const values = new Map([["username", "test-user"]]);
  let synced = false;
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
        console: silentConsole,
        core: { getVersion: () => ({ build: "180" }) },
        preferences: {
          get: (key) => values.get(key),
          set: (key, value) => values.set(key, value),
          sync: () => {
            synced = true;
          },
        },
        event: { on: (name, fn) => events.set(name, fn) },
        sidebar: { loadFile() {}, onMessage() {}, postMessage() {} },
        utils: {},
      },
    }
  );
  events.get("iina.window-loaded")();
  assert.equal(rpc.$setJWT("test-user", null), true);
  assert.equal(values.get("username"), "");
  assert.equal(synced, true);
});

function loadSidebar(client) {
  const script = source("ui/sidebar/app.vue").match(
    /<script>([\s\S]*?)<\/script>/
  )[1];
  const component = vm.runInNewContext(
    stripImports(script).replace("export default", "const component =") +
      "\ncomponent;",
    {
      console: silentConsole,
      global: {},
      client,
      rpc: {},
      FontAwesomeIcon: {},
      ModalPopup: {},
      SubInfo: {},
    }
  );
  const ctx = component.data();
  for (const [name, method] of Object.entries(component.methods))
    ctx[name] = method.bind(ctx);
  return ctx;
}

test("sidebar waits for the cached identity before displaying sign-in", async () => {
  const ready = deferred();
  const client = {
    ready: ready.promise,
    loggedIn: false,
    getUserInfo: async () => ({ data: { user_id: 1 } }),
  };
  const ctx = loadSidebar(client);
  const pending = ctx.login();
  assert.equal(ctx.modalShow, false);
  client.loggedIn = true;
  client.username = "test-user";
  ready.resolve();
  await pending;
  await new Promise(setImmediate);
  assert.equal(ctx.modalShow, false);
  assert.equal(ctx.userInfo.username, "test-user");
});

test("sidebar recovers from a rejected cached session with its specific error", async () => {
  const ctx = loadSidebar({
    ready: Promise.resolve(),
    loggedIn: true,
    getUserInfo: async () => {
      throw Object.assign(new Error("Invalid token"), { code: 401 });
    },
  });
  ctx.userInfo = { username: "old-user" };
  await ctx.getUserInfo();
  assert.equal(ctx.userInfo, null);
  assert.equal(ctx.modalShow, true);
  assert.equal(ctx.modalType, "login");
  assert.equal(ctx.loginError, "Invalid token");
});

test("a successful retry clears the previous sidebar login error", async () => {
  const ctx = loadSidebar({
    login: async () => ({ user: { user_id: 1 }, jwtSaved: false }),
  });
  ctx.loginUsername = "test-user";
  ctx.loginError = "Previous failure";
  await ctx.performLogin();
  assert.equal(ctx.loginError, "");
  assert.equal(ctx.errorSavingJWT, true);
  assert.equal(ctx.loggingIn, false);
});
