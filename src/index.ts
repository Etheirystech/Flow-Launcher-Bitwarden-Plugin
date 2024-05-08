import * as rpc from "vscode-jsonrpc/node.js";
import AsyncStorage from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/query-core";
import {
  getStaleTime,
  logToFile,
  startServer,
  fetchBw,
  searchBw,
  stopServer,
  isServerRunning,
  getFlowResponse,
} from "./helpers";
import { experimental_createPersister } from "@tanstack/query-persist-client-core";
import { clipboard } from "clipboard-sys";
import axios from "axios";
const connection = rpc.createMessageConnection(
  new rpc.StreamMessageReader(process.stdin),
  new rpc.StreamMessageWriter(process.stdout),
);
let isAuthenticated = false;

let initializedClientStaleTime = false;

const loadingAnimation: string[] = [];

// Function to start the server
let lastUsedAccount: null | {
  title: string;
  subtitle: string;
  IcoPath: string;
  jsonRPCAction: { method: string; parameters: any };
  contextData: any;
  score: string | number;
} = null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      persister: experimental_createPersister({
        // @ts-ignore

        storage: AsyncStorage,
        maxAge: 1000 * 60 * 60 * 12, // 12 hours
      }),
    },
  },
});

connection.onRequest("initialize", async (settings: Settings) => {
  return;
});
const auth = {
  email: "",
  password: "",
  totp: "",
};
connection.onRequest("query", async (params, settings: Settings) => {
  const port = settings?.bitwardenServerPort
    ? settings?.bitwardenServerPort
    : "58765";
  const isBwSrRunning = await isServerRunning(settings.bitwardenServerPort);

  const status: "locked" | "unauthenticated" = await fetchBw("status", port);

  isAuthenticated = status !== "unauthenticated";
  const { search, searchTerms, actionKeyword, rawQuery } = params;
  if (params.searchTerms[0] !== undefined) {
    auth.email = searchTerms[0];
    auth.password = searchTerms[1];
    auth.totp = searchTerms[2];
  }

  const staleTime = getStaleTime(settings.cache_ttl);
  if (!initializedClientStaleTime) {
    queryClient.setDefaultOptions({
      queries: {
        staleTime: staleTime,
      },
    });
    setInterval(() => {
      queryClient.refetchQueries();
    }, staleTime);
    initializedClientStaleTime = true;
  }

  function convertNumber(input: number) {
    if (input >= 0 && input <= 1) {
      return Math.round(100 - input * 100);
    } else {
      return 0;
    }
  }
  if (loadingAnimation.length <= 2) {
    loadingAnimation.push(".");
  } else {
    loadingAnimation.pop();
    loadingAnimation.pop();
  }

  if (!isAuthenticated) {
    return {
      result: [
        {
          title: "You are not logged in",
          subtitle: `Press enter to go to the page for instructions on how to login.`,
          jsonRPCAction: {
            method: "bw_login",
            parameters: [
              "https://github.com/Etheirystech/Flow-Launcher-Bitwarden-Plugin",
            ],
          },
          IcoPath: "./icon.png",
          score: 100,
        },
      ],
    };
  } else {
    startServer(port, isBwSrRunning)?.catch(logToFile);
    if (status === "locked") {
      return {
        result: [
          {
            title: "Unlock",
            subtitle: `Enter your password and press enter to unlock the vault.${loadingAnimation.join(
              "",
            )}`,
            jsonRPCAction: {
              method: "bw_unlock",
              parameters: [searchTerms[0], port],
            },
            IcoPath: "./icon.png",
            score: 100,
          },
          {
            title: "Stop server",
            subtitle: `Press enter to stop the server.`,
            jsonRPCAction: {
              method: "stop_bw_server",
              parameters: [port],
            },
            IcoPath: "./icon.png",
            score: 25,
          },
        ],
      };
    }
    if (
      rawQuery.startsWith(`${actionKeyword} Search `) ||
      rawQuery.startsWith(`${actionKeyword} search `)
    ) {
      const bwSearchTerms = [...searchTerms];
      bwSearchTerms.shift();
      const accounts = await queryClient.fetchQuery({
        queryKey: [`${bwSearchTerms.join(" ")}`],

        queryFn: () =>
          searchBw(bwSearchTerms.join(" "), port, false, staleTime),
      });

      if (accounts !== "SEARCH FAILED") {
        const accountsData = accounts.map((i) => {
          const title = i.item.name ? i.item.name : "";
          const subtitle = i?.item?.login?.username
            ? `${i?.item?.login?.username} | enter copy to clipboard, → for more`
            : "";
          const icoPath = "./icon.png";
          const method = "copy_to_clipboard";
          const params = [
            { ...i, port: port },
            i?.item?.login?.password,
            "password",
          ];
          const contextData = [{ ...i, port: port }];
          const score = convertNumber(Number(i.score));
          return getFlowResponse(
            title,
            subtitle,
            method,
            params,
            icoPath,
            score,
            contextData,
          );
        });

        return {
          result: accountsData,
        };
      }
    }
    if (lastUsedAccount) {
      return {
        result: [
          lastUsedAccount,
          {
            title: "Search",
            subtitle: "Press enter and start searching",
            jsonRPCAction: {
              method: "bw_start_search",
              parameters: [],
            },
            IcoPath: "./icon.png",
            score: 50,
          },
          {
            title: "Lock vault",
            subtitle: "Press enter to lock the vault",
            jsonRPCAction: {
              method: "bw_lock",
              parameters: [port],
            },
            IcoPath: "./icon.png",
            score: 45,
          },
          {
            title: "Sync vault",
            subtitle: `Press enter to sync the vault. Sync will be complete when flow closes`,
            jsonRPCAction: {
              method: "reset_all_cache",
              parameters: [port],
            },
            IcoPath: "./icon.png",
            score: 35,
          },
          {
            title: "Stop server",
            subtitle: `Press enter to stop the server.`,
            jsonRPCAction: {
              method: "stop_bw_server",
              parameters: [port],
            },
            IcoPath: "./icon.png",
            score: 25,
          },
        ],
      };
    } else {
      return {
        result: [
          {
            title: "Search",
            subtitle: "Press enter and start searching",
            jsonRPCAction: {
              method: "bw_start_search",
              parameters: [],
            },
            IcoPath: "./icon.png",
            score: 100,
          },
          {
            title: "Lock vault",
            subtitle: "Press enter to lock the vault",
            jsonRPCAction: {
              method: "bw_lock",
              parameters: [port],
            },
            IcoPath: "./icon.png",
            score: 60,
          },
          {
            title: `Sync vault`,

            subtitle: `Press enter to sync the vault. Sync will be complete when flow closes`,
            jsonRPCAction: {
              method: "reset_all_cache",
              parameters: [port],
            },

            IcoPath: "./icon.png",
            score: 50,
          },
          {
            title: `Stop server`,

            subtitle: `Press enter to stop the server.`,

            jsonRPCAction: {
              method: "stop_bw_server",
              parameters: [port],
            },
            IcoPath: `./icon.png`,
            score: 25,
          },
        ],
      };
    }
  }
});

connection.onRequest(
  "context_menu",
  (params: [{ item: Account; score: string | number; port: string }]) => {
    const port = params[0].port;
    const account = params[0].item;
    const id = account?.id;
    const username = account?.login?.username;
    const password = account?.login?.password;
    const totp = account?.login?.totp;

    if (totp) {
      return {
        result: [
          {
            title: `Username`,

            subtitle: `Copy username`,
            jsonRPCAction: {
              method: "copy_to_clipboard",
              parameters: [params[0], username, "email"],
            },

            IcoPath: "./icon.png",
          },
          {
            title: `Password`,

            subtitle: `Copy password`,
            jsonRPCAction: {
              method: "copy_to_clipboard",
              parameters: [params[0], password, "password"],
            },

            IcoPath: "./icon.png",
          },
          {
            title: `2FA`,

            subtitle: `Copy 2FA`,
            jsonRPCAction: {
              method: "copy_to_clipboard",
              parameters: [params[0], id, "totp"],
            },

            IcoPath: "./icon.png",
          },
          {
            title: `Sync vault`,

            subtitle: `Press enter to sync the vault. Sync will be complete when flow closes`,
            jsonRPCAction: {
              method: "reset_all_cache",
              parameters: [port],
            },

            IcoPath: "./icon.png",
          },
        ],
      };
    } else if (params) {
      return {
        result: [
          {
            title: `Username`,

            subtitle: `Copy username`,
            jsonRPCAction: {
              method: "copy_to_clipboard",
              parameters: [params[0], username, "email"],
            },

            IcoPath: "./icon.png",
          },
          {
            title: `Password`,

            subtitle: `Copy password`,
            jsonRPCAction: {
              method: "copy_to_clipboard",
              parameters: [params[0], password, "password"],
            },

            IcoPath: "./icon.png",
          },
          {
            title: `Sync vault`,

            subtitle: `Press enter to sync the vault. Sync will be complete when flow closes`,
            jsonRPCAction: {
              method: "reset_all_cache",
              parameters: [port],
            },

            IcoPath: "./icon.png",
          },
        ],
      };
    }
    return {
      result: [
        {
          title: `Reset current session cache`,

          subtitle: `Press enter to sync the vault. Sync will be complete when flow closes`,
          jsonRPCAction: {
            method: "reset_cache",
          },

          IcoPath: "./icon.png",
        },
        {
          title: `Sync vault`,

          subtitle: `Press enter to sync the vault. Sync will be complete when flow closes`,
          jsonRPCAction: {
            method: "reset_all_cache",
            parameters: [port],
          },

          IcoPath: "./icon.png",
        },
      ],
    };
  },
);
connection.onRequest("bw_login", (params) => {
  connection.sendRequest("OpenUrl", { url: params[0] });
  return {
    Hide: true,
  };
});

// NON WORKING LOGIN VERSION
/*connection.onRequest("bw_login", (params) => {
  const escapedPassword = shellEscape([params[1]])
  if (serverProcess) {
    logToFile(`ESCAPED ${escapedPassword}`)
    logToFile(`bw login ${params[0]} ${escapedPassword} ${  params[2] ?`--code ${params[2]}` : ""}`)
    serverProcess.stdin.write(`bw login ${params[0]} ${escapedPassword} ${params[2] ? `--code ${params[2]}` : ""}`);
  } else {
    logToFile(`bw login ${params[0]} ${escapedPassword} ${  params[2] ?`--code ${params[2]}` : ""}`)
    exec(`bw login ${params[0]} ${escapedPassword} ${  params[2] ?`--code ${params[2]}` : ""}`, (err, stdout, stderr) => { if (err) { logToFile(err) }})
    logToFile('Server process is not running');
  }
  return {
    Hide: true
  };
});*/

/*connection.onRequest("bw_logout", (params) => {
  if (serverProcess) {
    exec(`bw logout`, (err, stdout, stderr) => {
      if (err) {
        logToFile(err);
      }
    });
  } else {
    logToFile("Server process is not running");
  }
  return {
    Hide: true,
  };
});*/

connection.onRequest("bw_unlock", async (params) => {
  await fetchBw("unlock", params[1], { password: params[0] });
  return {
    Hide: true,
  };
});
connection.onRequest("bw_start_search", async (params) => {
  await connection.sendRequest("ChangeQuery", "bw Search ", true);
  return {
    Hide: false,
  };
});

connection.onRequest("bw_lock", async (params) => {
  await fetchBw("lock", params[0]);
  return {
    Hide: true,
  };
});

connection.onRequest("stop_bw_server", async (params) => {
  const port = params;
  const isBwSrRunning = await isServerRunning(params);
  stopServer(port, isBwSrRunning);

  return {
    Hide: true,
  };
});
connection.onRequest("start_bw_server", async (params, settings: Settings) => {
  const port = settings?.bitwardenServerPort
    ? settings?.bitwardenServerPort
    : "58765";
  const isBwSrRunning = await isServerRunning(settings.bitwardenServerPort);

  startServer(port, isBwSrRunning)?.catch(logToFile);

  return {
    Hide: true,
  };
});

connection.onRequest("reset_all_cache", async (params) => {
  try {
    lastUsedAccount = null;

    await axios.post(`http://[::1]:${params[0]}/sync`);
    await searchBw("", params[0], true);
    queryClient.clear();
  } catch (e) {
    logToFile(`SYNC ERROR ${e}`);
    return {
      Hide: true,
    };
  }

  return {
    Hide: true,
  };
});

connection.onRequest(
  "copy_to_clipboard",
  async (
    params: [
      { item: Account; score: string | number; port: string },
      string,
      "email" | "password" | "totp",
    ],
  ) => {
    const account = params[0].item;
    const id = account?.id;
    const title = account?.name;
    const username = account?.login?.username;
    const password = account?.login?.password;
    const score = params[1];
    if (lastUsedAccount && lastUsedAccount.title !== title) {
      lastUsedAccount = {
        title: title ? title : "",
        subtitle: username
          ? `${username} | enter copy to clipboard, → for more`
          : "",
        IcoPath: "./icon.png",
        jsonRPCAction: {
          method: "copy_to_clipboard",
          parameters: [
            { item: account, score: score, port: params[0].port },
            password,
            "password",
          ],
        },
        contextData: [{ item: account, score: score, port: params[0].port }],
        score: 100,
      };
    } else {
      lastUsedAccount = {
        title: title ? title : "",
        subtitle: username
          ? `${username} | enter copy to clipboard, → for more`
          : "",
        IcoPath: "./icon.png",
        jsonRPCAction: {
          method: "copy_to_clipboard",
          parameters: [
            { item: account, score: score, port: params[0].port },
            password,
            "password",
          ],
        },
        contextData: [{ item: account, score: score, port: params[0].port }],
        score: 100,
      };
    }

    if (params[2] === "totp") {
      const code = await fetchBw("2fa", params[0].port, { totpId: id });

      clipboard.writeText(`${code}`);
    }
    if (params[2] === "email") {
      clipboard.writeText(username);
    }
    if (params[2] === "password") {
      clipboard.writeText(password);
    }
    // connection.sendRequest("CopyToClipboard", params[0])

    return {
      Hide: true,
    };
  },
);

connection.listen();
