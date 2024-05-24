import "../shared.scss";

import { createApp } from "vue";
import App from "./app.vue";

import { API, Client } from "../../src/opensub";
import { rpcClient } from "../../src/message";

import { library } from "@fortawesome/fontawesome-svg-core";
import {
  faUser,
  faDownload,
  faInfo,
  faChartPie,
  faCircleInfo,
} from "@fortawesome/free-solid-svg-icons";

library.add(faUser);
library.add(faDownload);
library.add(faInfo);
library.add(faChartPie);
library.add(faCircleInfo);

document.addEventListener("DOMContentLoaded", () => {
  createApp(App).mount("#root");
  window.API = API;
});

export const client = new Client();
export const rpc = rpcClient(iina);

rpc.$requestDownload = () => {
  // global.needSearch = true;
  global.startSearch();
};
