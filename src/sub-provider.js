import { rpc } from "./index";

const { console, subtitle, sidebar } = iina;

export function register() {
  subtitle.registerProvider("open-sub", {
    search: async () => {
      sidebar.show();
      rpc.$requestDownload();
      return subtitle.CUSTOM_IMPLEMENTATION;
    },
    description: (item) => {
      return null;
    },
    download: async (item) => {
      return null;
    },
  });
  console.log("Sub provider registered");
}
