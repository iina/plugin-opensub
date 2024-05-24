export function rpcClient(iinaModule) {
  return new Proxy(
    {},
    {
      set: (target, name, value) => {
        if (typeof value !== "function") {
          throw new Error("RPC server only accepts functions");
        }
        if (!name.startsWith("$")) {
          throw new Error(`Define RPC functions with $ prefix`);
        }
        target[name] = value;
        iinaModule.onMessage(`#call.${name}`, async ({ args }) => {
          console.log(`RPC call: ${name}, args: ${args}`);
          let res = value.apply(this, args);
          if (res instanceof Promise) {
            res = await res;
          }
          iinaModule.postMessage(`#on.${name}`, { res });
        });
        console.log(`RPC server registered: ${name}`);
        return true;
      },
      get: (target, name) => {
        if (typeof name !== "string" || !name.startsWith("$")) {
          return target[name];
        }
        return (...args) => {
          return new Promise((resolve) => {
            iinaModule.onMessage(`#on.${name}`, ({ res }) => {
              console.log(`RPC got response: ${name}, ${res}`);
              iinaModule.onMessage(`#on.${name}`, null);
              resolve(res);
            });
            console.log(`RPC call: ${name}, args: ${args}`);
            iinaModule.postMessage(`#call.${name}`, { args });
          });
        };
      },
    },
  );
}
