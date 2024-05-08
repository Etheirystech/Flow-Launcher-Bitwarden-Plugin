interface Settings {
  cache_ttl:
    | "5 minutes"
    | "15 minutes"
    | "30 minutes"
    | "1 hour"
    | "6 hours"
    | "12 hours"
    | "1 day"
    | "Indefinite";
  actionKeyword: string;
  bitwardenEmail: string | undefined;
  bitwardenPassword: string | undefined;
  bitwardenServerPort: string;
}
type StaleTimeDuration =
  | "5 minutes"
  | "15 minutes"
  | "30 minutes"
  | "1 hour"
  | "6 hours"
  | "12 hours"
  | "1 day"
  | "Indefinite";

type Methods =
  | "reset_cache"
  | "save_cache"
  | "open_url"
  | "clear_cache"
  | "initialize"
  | "query"
  | "context_menu"
  | "OpenUrl"
  | "reset_all_cache"
  | "start_bw_server"
  | "stop_bw_server"
  | "bw_lock"
  | "bw_login"
  | "bw_unlock"
  | "bw_start_search"
  | "copy_to_clipboard";

interface Account {
  id: string;
  name: string;
  login: {
    username: string;
    password: string;
    totp: string | null;
    uris: [{ uri: string }];
  };
}

interface MyFlowResponse {
  title: string;

  subtitle: string;
  jsonRPCAction: {
    method: Methods;
    parameters?: any[];
  };
  IcoPath: string;
  score?: number;
  contextData?: any[];
}
