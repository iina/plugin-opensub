/**
 * This file should only be used by the code inside the webview.
 */

import axios from "axios";
import * as METHODS from "./methods.json";
import { rpcClient } from "./message";

const API_KEY = "02WzVTIcNbbJ0IOQH3vZIATriQj9slZx";

class RequestError extends Error {}

class ResponseError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export class API {
  endpoint = "https://api.opensubtitles.com/api/v1";
  headers = null;

  constructor(apiKey = null, endpoint = null) {
    this.headers = {
      Accept: "*/*",
      "Content-Type": "application/json",
      "Api-Key": apiKey ?? API_KEY,
      "User-Agent": "IINAPlugin v0.0.1",
    };

    this.endpoint = endpoint ?? this.endpoint;

    for (const method of Object.keys(METHODS)) {
      const urlParts = method.split("/").filter(Boolean);
      const name = urlParts.pop();
      let obj = this;
      for (const part of urlParts) {
        if (!obj[part]) {
          obj[part] = {};
        }
        obj = obj[part];
      }
      obj[name] = this.#createMethod(METHODS[method]);
    }
  }

  #createMethod(def) {
    return async (reqParams = {}, jwt = null) => {
      const { method, path, body, params, headers } = this.#buildRequest(
        def,
        reqParams,
      );
      console.log(method, path, body, headers);
      if (jwt && def.opts?.auth) {
        console.log("Using JWT for request");
        headers.Authorization = `Bearer ${jwt}`;
      }
      try {
        const res = await axios({
          method,
          url: `${this.endpoint}${path}`,
          params,
          headers,
          data: body,
        });
        if (res.status !== 200) {
          throw new RequestError(`Request failed with status ${res.status}`);
        }
        return res;
      } catch (error) {
        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          console.log(`Error requesting ${def.url}`, error.response);
          iina.postMessage("error", `Error requesting ${def.url}`);
          iina.postMessage("error", error.response);
          const status = error.response.status;
          if (status === 401) {
            const message =
              error.response.data.message || "Invalid credentials";
            throw new ResponseError(status, message);
          } else {
            throw new ResponseError(
              status,
              `Error ${error.response.status}. ${error.response?.data?.message}`,
            );
          }
        } else if (error.request) {
          // The request was made but no response was received
          // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
          // http.ClientRequest in node.js
          iina.postMessage(
            "error",
            `Error requesting ${def.url}: no response received`,
          );
          iina.postMessage("error", error.request);
          throw new RequestError("No response received");
        } else {
          // Something happened in setting up the request that triggered an Error
          iina.postMessage("error", `Error setting up ${def.url}`);
          iina.postMessage("error", error.message);
          throw new RequestError(error.message);
        }
      }
    };
  }

  #buildRequest(def, userParams) {
    const method = def.method || "GET";
    let path = def.url;
    const ss = def.url.split("?");
    const params = {};
    if (ss.length == 2) {
      const urlParams = ss[1].split("&");
      for (const up of urlParams) {
        const name = up.split("=")[0];
        if (userParams.hasOwnProperty(name)) {
          params[name] = userParams[name];
        } else if (!def.optional.includes(name)) {
          throw new Error(`Missing required parameter: ${name}`);
        }
      }
      path = ss[0];
    }
    const body = method === "POST" ? userParams : undefined;
    const headers = { ...this.headers };
    return { method, path, body, params, headers };
  }
}

export class Client {
  apiKey = null;
  baseURL = "api.opensubtitles.com";
  username = null;
  #jwtToken = null;

  constructor(options = {}) {
    if (options.api_key) {
      this.apiKey = options.api_key;
    }
    if (options.endpoint) {
      this.endpoint = options.endpoint;
    }
    this.api = new API(this.apiKey, this.endpoint);
    this.rpc = new rpcClient(iina);

    console.log("Client created");

    this.rpc.$getJWT().then(({ jwt, username }) => {
      console.log("Received JWT", jwt, username);
      if (typeof jwt === "string" && jwt.length > 0) {
        this.#jwtToken = jwt;
        this.username = username;
      } else {
        this.#jwtToken = null;
      }
    });
  }

  get endpoint() {
    return `https://${this.baseURL}/api/v1`;
  }

  get loggedIn() {
    return this.#jwtToken !== null;
  }

  async login(username, password) {
    const res = await this.#req(() =>
      this.api.user.login({ username, password }),
    );
    console.log(res);
    // Save JWT globally. Don't care whether success or not, code in the plugin instance will handle it.
    const token = res.data.token;
    const success = this.rpc.$setJWT(username, token);
    this.#jwtToken = token;
    this.username = username;
    res.data.jwtSaved = success;
    if (res.data.base_url) {
      this.baseURL = res.data.base_url;
      console.log("Base URL changed to", this.baseURL);
    }
    return res.data;
  }

  async logout() {
    const res = await this.#req(() => this.api.user.logout({}, this.#jwtToken));
    this.#jwtToken = null;
    const success = this.rpc.$setJWT(this.username, null);
    return res;
  }

  async getUserInfo() {
    if (!this.loggedIn) {
      throw new Error("Not logged in");
    }
    const res = await this.#req(() =>
      this.api.infos.user(null, this.#jwtToken),
    );
    return res.data;
  }

  async getLanguages() {
    const res = await this.#req(() => this.api.infos.languages());
    return res.data;
  }

  async search(options) {
    const res = await this.#req(() => this.api.subtitles(options));
    return res.data;
  }

  async download(idList) {
    const resData = await Promise.all(
      idList.map(async (id) => {
        const res = await this.#req(() =>
          this.api.download({ file_id: id }, this.#jwtToken),
        );
        console.log(res.data);
        return res.data;
      }),
    );
    if (resData.length === 0) return;

    const linkList = resData.map(({ link, file_name }) => ({
      link,
      file_name,
    }));
    await this.rpc.$downloadFile(linkList);

    const lastRes = resData.slice(-1)[0];
    return lastRes;
  }

  async #req(fn) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ResponseError && error.code === 401) {
        console.log("Invalid JWT token, clearing it");
        this.#jwtToken = null;
      }
      throw error;
    }
  }
}
