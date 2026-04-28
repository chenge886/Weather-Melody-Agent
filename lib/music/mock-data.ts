import type { TrackCard } from "@/lib/types";

interface MockTrack extends TrackCard {
  tags: string[];
}

const MOCK_TRACKS: MockTrack[] = [
  {
    id: "347230",
    title: "夜空中最亮的星",
    artist: "逃跑计划",
    album: "世界",
    coverUrl: "https://p2.music.126.net/W9Gm27nYfX2R5KzPMSM8Wg==/109951166609111234.jpg",
    deepLink: "https://music.163.com/#/song?id=347230",
    reason: "鼓点推进和人声爆发很适合夜跑与自我打气。",
    tags: ["夜晚", "城市", "能量", "励志"]
  },
  {
    id: "167876",
    title: "晴天",
    artist: "周杰伦",
    album: "叶惠美",
    coverUrl: "https://p1.music.126.net/K13lQoc6A8Aq6N0VdV5w8g==/109951166449750182.jpg",
    deepLink: "https://music.163.com/#/song?id=167876",
    reason: "旋律轻快有画面感，适合晴朗午后和通勤回程。",
    tags: ["晴天", "轻松", "青春"]
  },
  {
    id: "185809",
    title: "七里香",
    artist: "周杰伦",
    album: "七里香",
    coverUrl: "https://p1.music.126.net/4jN_8gX-l_8xwP7d3f3M8A==/109951166449747713.jpg",
    deepLink: "https://music.163.com/#/song?id=185809",
    reason: "木吉他和弦乐很温柔，适合傍晚散步。",
    tags: ["温柔", "傍晚", "恋爱"]
  },
  {
    id: "28949444",
    title: "平凡之路",
    artist: "朴树",
    album: "猎户星座",
    coverUrl: "https://p2.music.126.net/B4c3MrwKzIh4A4LMR_7Ukg==/109951166847660765.jpg",
    deepLink: "https://music.163.com/#/song?id=28949444",
    reason: "节奏稳、叙事感强，特别适合公路和旅行场景。",
    tags: ["旅行", "公路", "治愈"]
  },
  {
    id: "33955082",
    title: "告白气球",
    artist: "周杰伦",
    album: "周杰伦的床边故事",
    coverUrl: "https://p1.music.126.net/7tAcJKuFvYx8zq59QbZeHw==/109951166449761655.jpg",
    deepLink: "https://music.163.com/#/song?id=33955082",
    reason: "律动轻盈，适合甜感聊天和周末出门。",
    tags: ["甜", "约会", "轻快"]
  },
  {
    id: "186016",
    title: "后来",
    artist: "刘若英",
    album: "我等你",
    coverUrl: "https://p1.music.126.net/SfhqgYxOGMWzj2Yj7z0EmQ==/109951166449710755.jpg",
    deepLink: "https://music.163.com/#/song?id=186016",
    reason: "情绪递进明显，适合深夜情感向聆听。",
    tags: ["深夜", "情绪", "雨天"]
  },
  {
    id: "1330348068",
    title: "像我这样的人",
    artist: "毛不易",
    album: "平凡的一天",
    coverUrl: "https://p1.music.126.net/mkM5J0SL14w52J4Qqjytwg==/109951166226223787.jpg",
    deepLink: "https://music.163.com/#/song?id=1330348068",
    reason: "歌词共鸣强，适合低能量时的自我安慰。",
    tags: ["emo", "治愈", "独处", "雨天"]
  },
  {
    id: "447925558",
    title: "起风了",
    artist: "买辣椒也用券",
    album: "起风了",
    coverUrl: "https://p1.music.126.net/y9a4VfM0h4fsGJQkk8E6Yw==/109951166249089523.jpg",
    deepLink: "https://music.163.com/#/song?id=447925558",
    reason: "副歌抬升明显，适合想重启状态的时候。",
    tags: ["风", "成长", "热血", "夜晚"]
  }
];

export function searchMockTracks(query: string, mood?: string, limit = 6): TrackCard[] {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedMood = mood?.trim().toLowerCase();

  const scored = MOCK_TRACKS.map((track) => {
    let score = 0;
    if (normalizedQuery) {
      if (track.title.toLowerCase().includes(normalizedQuery)) score += 3;
      if (track.artist.toLowerCase().includes(normalizedQuery)) score += 2;
      if (track.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))) score += 2;
      if (track.reason.toLowerCase().includes(normalizedQuery)) score += 1;
    }

    if (normalizedMood && track.tags.some((tag) => tag.toLowerCase().includes(normalizedMood))) {
      score += 2;
    }

    return { track, score };
  })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.track);

  const fallback = scored.filter((track) => track.tags.some((tag) => tag.includes("治愈") || tag.includes("轻快")));
  const candidates = scored.length > 0 ? scored : fallback;

  return candidates.slice(0, Math.max(1, limit));
}
