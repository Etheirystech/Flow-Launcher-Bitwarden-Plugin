import * as fs from "fs";
import axios from "axios";
import Fuse from "fuse.js";
import { exec, spawn } from "child_process";
import { ChildProcessWithoutNullStreams } from "node:child_process";
import { QueryClient } from "@tanstack/query-core";
import { experimental_createPersister } from "@tanstack/query-persist-client-core";
import AsyncStorage from "@tanstack/query-async-storage-persister";

export function logToFile(message: any) {
  fs.appendFile("log.txt", message + "\n\n", function (err: any) {
    if (err) throw err;
  });
}

export function getStaleTime(duration: StaleTimeDuration) {
  let staleTime;

  switch (duration) {
    case "5 minutes":
      staleTime = 5 * 60 * 1000;
      break;
    case "15 minutes":
      staleTime = 15 * 60 * 1000;
      break;
    case "30 minutes":
      staleTime = 30 * 60 * 1000;
      break;
    case "1 hour":
      staleTime = 60 * 60 * 1000;
      break;
    case "6 hours":
      staleTime = 6 * 60 * 60 * 1000;
      break;
    case "12 hours":
      staleTime = 12 * 60 * 60 * 1000;
      break;
    case "1 day":
      staleTime = 24 * 60 * 60 * 1000;
      break;
    case "Indefinite":
      staleTime = Infinity;
      break;
    default:
      console.error("Invalid duration");
      return 5 * 60 * 1000;
  }

  return staleTime;
}

export async function fetchBw(
  type: "status" | "unlock" | "lock" | "2fa",
  port: string,
  params?: { password?: string; search?: string; totpId?: string },
) {
  const instance = axios.create({
    baseURL: `http://[::1]:${port}`,
  });

  if (type === "status") {
    try {
      const res = await instance.get(`/status`);

      return res.data?.data?.template?.status;
    } catch (err: any) {
      const status = await isAuthenticated();
      return status;
    }
  }

  if (type === "2fa") {
    try {
      const res = await instance.get(`/object/totp/${params?.totpId}`);

      return res?.data?.data?.data;
    } catch (err: any) {
      logToFile(`2FA ERROR: ${err}`);
      return "No 2fa";
    }
  }

  if (type === "unlock") {
    try {
      const res = await instance.post(`/unlock`, {
        password: params?.password,
      });
    } catch (err: any) {
      logToFile(err);
    }
  }

  if (type === "lock") {
    try {
      const res = await instance.post(`/lock`);
    } catch (err: any) {
      logToFile(err);
    }
  }
}

export let serverProcess: ChildProcessWithoutNullStreams;
export function startServer(port: string, isServerRunning: boolean) {
  if (!isServerRunning) {
    const command = ".\\bw.exe";
    const args = ["serve", "--port", `${port}`, "--hostname", "localhost"];
    serverProcess = spawn(command, args, { shell: true });
    // Keep the event loop busy until the server process exits
    return new Promise((resolve, reject) => {
      serverProcess.on("exit", resolve);
      serverProcess.on("error", reject);
    });
  }
  return;
}

export function stopServer(port: string, isServerRunning: boolean) {
  if (isServerRunning && port) {
    exec(`netstat -aon | findstr "${port}"`, (error, stdout, stderr) => {
      if (error) {
        logToFile(`exec error STOP: ${error}`);
        return;
      }

      const output = stdout.split("\n")[0].trim().split(/\s+/);
      const result = output[output.length - 1];
      exec(`taskkill /F /PID ${result}`, (error, stdout, stderr) => {
        if (error) {
          logToFile(`exec error KILL: ${error}`);
          return;
        }
      });
    });
  }
}

export async function isServerRunning(port: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    exec(`netstat -aon | findstr "${port}"`, (error, stdout, stderr) => {
      if (error) {
        logToFile(`exec error: ${error}`);
        resolve(false);
      }

      const output = stdout.split("\n")[0].trim().split(/\s+/);
      const result = output[output.length - 1];
      resolve(result !== "0");
    });
  });
}

export async function isAuthenticated(): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`bw status`, (error, stdout, stderr) => {
      if (error) {
        logToFile(`exec error: ${error}`);
        resolve("unauthenticated");
      }

      try {
        const statusObject = JSON.parse(stdout);
        resolve(statusObject.status);
      } catch (parseError) {
        logToFile(`JSON parse error: ${parseError}`);
        resolve("unauthenticated");
      }
    });
  });
}

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
let initializedClientStaleTime = false;
export async function searchBw(
  search: string,
  port: string,
  resetCache = false,
  staleTime?: number,
) {
  const instance = axios.create({
    baseURL: `http://[::1]:${port}`,
  });

  const fuseOptions = {
    // isCaseSensitive: false,
    includeScore: true,
    // shouldSort: true,
    // includeMatches: true,
    // findAllMatches: false,
    // minMatchCharLength: params.search.length,
    // location: 0,
    threshold: 0.5,
    // distance: 100,
    // useExtendedSearch: false,
    // ignoreLocation: false,
    // ignoreFieldNorm: false,
    // fieldNormWeight: 1,
    keys: [
      {
        name: "name",
        weight: 1,
      },
      {
        name: "login.username",
        weight: 0.4,
      },
    ],
  };
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
  if (resetCache) {
    queryClient.clear();
  }

  try {
    const res = await queryClient.fetchQuery({
      queryKey: [`latest-vault-cache-256`],

      queryFn: () => instance.get(`/list/object/items`),
    });
    const data: Account[] = res?.data?.data?.data;
    const fuse = new Fuse(data, fuseOptions);

    return fuse.search(`${search}`);
  } catch (err: any) {
    logToFile(err);

    return "SEARCH FAILED";
  }
}
export function getFlowResponse(
  title: string,
  subtitle: string,
  method: Methods,
  params: any[],
  IcoPath: string,
  score: number,
  contextData?: any[],
): MyFlowResponse {
  return {
    title,
    subtitle,
    jsonRPCAction: {
      method,
      parameters: params,
    },
    IcoPath,
    score,
    contextData,
  };
}
/*
export async function getFaviconUrl(url: string) {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    let faviconUrl = $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href');

    // Parse the website name from the URL
    const websiteName = new URL(url).hostname;

    // Create the directory path
    const dirPath = path.join('favicons', websiteName);

    // Create the file path
    const filePath = path.join(dirPath, 'favicon.ico');

    // If the favicon file already exists, return the existing file path
    if (fs.existsSync(filePath)) {
      return filePath;
    }

    // If there's no favicon on the website, return the default icon path
    if (!faviconUrl) {
      return './icon.png';
    }

    // If the favicon URL is relative, convert it to an absolute URL
    if (faviconUrl.startsWith('/')) {
      faviconUrl = new URL(faviconUrl, url).toString();
    }

    // Download the favicon
    const faviconResponse = await axios({
      url: faviconUrl,
      responseType: 'arraybuffer',  // This is important
    });

    // Create the directory if it doesn't exist
    fs.mkdirSync(dirPath, { recursive: true });

    // Write the favicon data to a file only if it doesn't exist
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, faviconResponse.data);
    }

    // Return the file path
    return filePath;
  } catch (error) {
    console.error(error);
    return '/icon.png';
  }
}
*/
