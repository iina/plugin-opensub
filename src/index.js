import { rpcClient } from "./message";
import { register } from "./sub-provider";

const {
  core,
  standaloneWindow,
  sidebar,
  console,
  menu,
  event,
  http,
  utils,
  preferences,
} = iina;

console.log("Plugin is running");

const iinaVersion = parseInt(core.getVersion().build);
const keychainAvailable =
  iinaVersion >= 140 && preferences.get("save_login") === "keychain";

event.on("iina.menu-update", () => {
  menu.removeAllItems();
  menu.addItem(
    menu.item(
      "Personal API Key…",
      () => {
        const enteredKey = utils.prompt(
          "Enter your OpenSubtitles API key. It will be saved in the system keychain. Leave blank to use IINA's shared key.",
        );
        if (enteredKey === null) return;
        const key = enteredKey.trim();
        if (key && !utils.keychainWrite("opensubtitles-api", "personal", key)) {
          core.osd("Could not save the API key in the system keychain.");
          return;
        }
        preferences.set("personal_api_key_enabled", !!key);
        // Sessions obtained with the previous API key must not be reused.
        preferences.set("username", "");
        preferences.sync();
        sidebar.postMessage("api-config-changed", {});
        core.osd(
          key
            ? "Personal OpenSubtitles API key enabled."
            : "IINA's shared OpenSubtitles API key enabled.",
        );
      },
      { enabled: iinaVersion >= 140 && core.window.visible },
    ),
  );
  menu.addItem(
    menu.item(
      "Show Sidebar",
      () => {
        sidebar.show();
      },
      { keyBinding: "Meta+p", enabled: core.window.visible },
    ),
  );
});

export const rpc = rpcClient(sidebar);
global.rpc = rpc;

event.on("iina.window-loaded", () => {
  sidebar.loadFile("dist/ui/sidebar/index.html");

  rpc.$sendOSD = (message) => {
    core.osd(message);
  };

  rpc.$getJWT = () => {
    return getCachedJWT();
  };

  rpc.$getAPIConfig = () => {
    const personalAPIKeyEnabled = !!preferences.get("personal_api_key_enabled");
    if (!personalAPIKeyEnabled) return { personalAPIKeyEnabled: false };
    const apiKey = utils.keychainRead("opensubtitles-api", "personal");
    return {
      personalAPIKeyEnabled,
      apiKey: typeof apiKey === "string" && apiKey.length ? apiKey : null,
    };
  };

  rpc.$getFileName = () => {
    return core.status.title;
  };

  rpc.$setJWT = (username, token) => {
    if (!keychainAvailable) {
      console.log("setJWT: keychain not available");
      return;
    }
    console.log(`setJWT: ${username}; token length: ${token?.length}`);
    if (typeof token !== "string" || token.length === 0) {
      console.log(`setJWT: no token`);
      return false;
    }
    const success = utils.keychainWrite("opensubtitles", username, token);
    if (success) {
      preferences.set("username", username);
      preferences.sync();
      return true;
    } else {
      console.log(`setJWT: keychain write failed`);
      return false;
    }
  };

  rpc.$setLanguages = (languages) => {
    console.log(`setLanguages: ${languages}`);
    preferences.set("languages", languages);
    preferences.sync();
  };

  rpc.$getLanguages = () => {
    const res = preferences.get("languages") ?? "";
    if (typeof res !== "string" || !res.match(/^[a-z\-]+(,[a-z\-]+)*$/)) {
      preferences.set("languages", "");
      preferences.sync();
      return "";
    }
    return res;
  };

  rpc.$downloadFile = async (items) => {
    for (const { link, file_name } of items) {
      console.log(`downloadFile: ${file_name}`);
      const dest = `@tmp/${file_name}`;
      await http.download(link, dest);
      core.subtitle.loadTrack(utils.resolvePath(dest));
      console.log(dest);
    }
  };

  rpc.$openLink = async (link) => {
    utils.open(link);
  };

  sidebar.onMessage("error", (error) => {
    console.error(error);
  });

  postCachedJWT();
});

function postCachedJWT() {
  const jwt = getCachedJWT();
  sidebar.postMessage("jwt", { jwt });
}

function getCachedJWT() {
  if (!keychainAvailable) {
    console.log("getJWT: keychain not available");
    return;
  }
  const username = preferences.get("username");
  if (!username) {
    console.log("getJWT: no username");
    return;
  }
  console.log(`getJWT: ${username}`);
  const jwt = utils.keychainRead("opensubtitles", username) ?? null;
  console.log(`getJWT: token length: ${jwt?.length}`);
  return { jwt, username };
}

register();
