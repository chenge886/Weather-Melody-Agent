import { afterEach } from "vitest";

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.MUSIC_PROVIDER;
  delete process.env.NCM_CLI_BIN;
  delete process.env.NCM_CLI_TIMEOUT_MS;
  delete process.env.NCM_CLI_USE_MOCK;
  delete process.env.NCM_CLI_ALLOW_MOCK_FALLBACK;
  delete process.env.NETEASE_USE_MOCK;
  delete process.env.NETEASE_ALLOW_MOCK_FALLBACK;
  delete process.env.NETEASE_BASE_URL;
  delete process.env.NETEASE_SEARCH_PATH;
  delete process.env.NETEASE_DETAIL_PATH;
  delete process.env.NETEASE_ACCESS_TOKEN;
  delete process.env.NETEASE_APP_KEY;
  delete process.env.NETEASE_APP_SECRET;
});
