# Weather Melody Agent

一个「AI DJ 电台」风格的音乐 Agent Demo（移动端优先），支持：
- 暗色点阵电台 UI（类似 Claudio 风格）
- 推荐逻辑基于：天气 + 喜好歌单 + 今日日程
- DeepSeek 生成推荐话术
- Fish Audio 文本转语音（流式音频块）
- 网易云数据优先走 `ncm-cli`（个人开发者可用），并支持 mock 降级
- 页面内直接播放推荐歌曲（有 `streamUrl` 时可点“播放”）

## 快速开始

```bash
npm install
copy .env.example .env.local
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)

## 必要配置

在 `.env.local` 至少配置：

- `MUSIC_PROVIDER=cli`
- `DEEPSEEK_API_KEY=...`
- `FISH_AUDIO_API_KEY=...`
- `FISH_AUDIO_VOICE_ID=...`
- `QWEATHER_TOKEN=...`（或 `QWEATHER_API_KEY`）

## ncm-cli / mpv

- Windows 安装 mpv：`winget install mpv.mpv`
- 安装并验证 ncm-cli：`ncm-cli -h`
- 登录：`ncm-cli login`

如果本机暂未安装 CLI，设置：

```env
NCM_CLI_ALLOW_MOCK_FALLBACK=true
```

系统会自动回落到内置样例曲库，保证演示不断。

## API 路由

- `POST /api/agent/live`：流式 DJ 会话（NDJSON）
- `POST /api/agent/recommend`：一次性推荐
- `POST /api/music/search`：音乐搜索
- `GET /api/music/stream?target=...`：音频代理播放
- `POST /api/realtime/session`：OpenAI Realtime 会话初始化（可选）

## 测试

```bash
npm run typecheck
npm run test
npm run build
```
