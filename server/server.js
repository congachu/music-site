const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ----- "DB" 대신 JSON 파일 사용 -----
const DB_FILE = path.join(__dirname, "db.json");

function loadDB() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    // 파일 없으면 초기 구조 생성
    return {
      users: [],
      sessions: [],
      songs: [],
      likes: [],
    };
  }
}

let db = loadDB();

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function getNextId(list) {
  if (!list.length) return 1;
  return Math.max(...list.map((x) => x.id)) + 1;
}

function sanitizeText(input, maxLen = 100) {
  if (typeof input !== "string") return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.length > maxLen) {
    return trimmed.slice(0, maxLen);
  }
  return trimmed;
}

// 유튜브 URL만 허용 + 안전한 형태로 변환
function normalizeYouTubeUrl(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();

  const allowedHosts = [
    "www.youtube.com",
    "youtube.com",
    "m.youtube.com",
    "youtu.be",
  ];

  if (!allowedHosts.includes(hostname)) {
    return null; // 유튜브 도메인만 허용
  }

  let videoId = null;

  if (hostname === "youtu.be") {
    // https://youtu.be/VIDEOID
    videoId = url.pathname.slice(1);
  } else {
    // https://www.youtube.com/watch?v=VIDEOID 형태
    videoId = url.searchParams.get("v");
  }

  if (!videoId) return null;

  // 영상 ID 형식 간단 검증 (영문, 숫자, -, _ 정도만 허용)
  if (!/^[a-zA-Z0-9_-]{5,20}$/.test(videoId)) {
    return null;
  }

  // 우리가 안전하다고 판단하는 표준 URL로 재조립
  return `https://www.youtube.com/watch?v=${videoId}`;
}


// ----- Express 기본 설정 -----
const app = express();
const PORT = 4000;

app.use(
  cors({
    origin: "http://localhost:5173", // React 개발 서버 주소
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());

// ----- 유틸 / 미들웨어 -----
function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function authMiddleware(req, res, next) {
  const token = req.cookies.session;
  if (!token) return res.status(401).json({ message: "로그인이 필요합니다." });

  const session = db.sessions.find((s) => s.token === token);
  if (!session) {
    return res.status(401).json({ message: "세션이 유효하지 않습니다." });
  }

  const user = db.users.find((u) => u.id === session.user_id);
  if (!user) {
    return res.status(401).json({ message: "유저를 찾을 수 없습니다." });
  }

  req.user = { id: user.id, nickname: user.nickname };
  next();
}

// ----- 1. 간편 로그인 -----
app.post("/api/login", (req, res) => {
  const { nickname } = req.body;
  if (!nickname || !nickname.trim()) {
    return res.status(400).json({ message: "닉네임을 입력하세요." });
  }

  const trimmed = nickname.trim();

  let user = db.users.find((u) => u.nickname === trimmed);
  if (!user) {
    user = {
      id: getNextId(db.users),
      nickname: trimmed,
      created_at: new Date().toISOString(),
    };
    db.users.push(user);
    saveDB();
  }

  const token = createSessionToken();
  const session = {
    id: getNextId(db.sessions),
    user_id: user.id,
    token,
    created_at: new Date().toISOString(),
  };
  db.sessions.push(session);
  saveDB();

  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    // secure: true, // HTTPS 쓸 때
  });

  res.json({ id: user.id, nickname: user.nickname });
});

app.post("/api/logout", (req, res) => {
  const token = req.cookies.session;
  if (token) {
    db.sessions = db.sessions.filter((s) => s.token !== token);
    saveDB();
    res.clearCookie("session");
  }
  res.json({ message: "로그아웃 완료" });
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json(req.user);
});

// ----- 2. 노래 등록 + 목록 -----
app.post("/api/songs", authMiddleware, (req, res) => {
  const { title, artist, genre, youtubeUrl } = req.body;

  const safeTitle = sanitizeText(title, 100);
  const safeArtist = sanitizeText(artist, 80);
  const safeGenre = sanitizeText(genre, 40);
  const safeYoutube = normalizeYouTubeUrl(youtubeUrl);

  if (!safeTitle || !safeArtist || !safeGenre || !safeYoutube) {
    return res.status(400).json({ message: "입력값이 올바르지 않습니다." });
  }

  const song = {
    id: getNextId(db.songs),
    title: safeTitle,
    artist: safeArtist,
    genre: safeGenre,
    youtube_url: safeYoutube, // 여기 중요
    owner_id: req.user.id,
    created_at: new Date().toISOString(),
  };

  db.songs.push(song);
  saveDB();

  res.status(201).json(song);
});

// 장르별 목록 + 정렬 (recent / popular)
app.get("/api/songs", authMiddleware, (req, res) => {
  const { genre, sort } = req.query;

  let list = [...db.songs];

  if (genre && genre !== "all") {
    list = list.filter((s) => s.genre === genre);
  }

  // like_count 붙이기
  list = list.map((s) => {
    const like_count = db.likes.filter((l) => l.song_id === s.id).length;
    return { ...s, like_count };
  });

  if (sort === "popular") {
    list.sort((a, b) => {
      if (b.like_count === a.like_count) {
        return new Date(b.created_at) - new Date(a.created_at);
      }
      return b.like_count - a.like_count;
    });
  } else {
    // default: 최신순
    list.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  res.json(list);
});

// ----- 좋아요 토글 -----
app.post("/api/songs/:id/like", authMiddleware, (req, res) => {
  const songId = Number(req.params.id);
  const userId = req.user.id;

  const song = db.songs.find((s) => s.id === songId);
  if (!song) {
    return res.status(404).json({ message: "곡을 찾을 수 없습니다." });
  }

  const existing = db.likes.find(
    (l) => l.user_id === userId && l.song_id === songId
  );

  if (existing) {
    db.likes = db.likes.filter((l) => l !== existing);
    saveDB();
    return res.json({ liked: false });
  } else {
    const like = {
      id: getNextId(db.likes),
      user_id: userId,
      song_id: songId,
      created_at: new Date().toISOString(),
    };
    db.likes.push(like);
    saveDB();
    return res.json({ liked: true });
  }
});

// 특정 곡에 대해 현재 유저가 좋아요 중인지
app.get("/api/songs/:id/like", authMiddleware, (req, res) => {
  const songId = Number(req.params.id);
  const userId = req.user.id;

  const existing = db.likes.find(
    (l) => l.user_id === userId && l.song_id === songId
  );

  res.json({ liked: !!existing });
});

// ----- 3. 추천 알고리즘 -----
app.get("/api/recommendations", authMiddleware, (req, res) => {
  const userId = req.user.id;

  // 1) 유저가 좋아요한 곡들
  const liked = db.likes.filter((l) => l.user_id === userId);
  const likedSongs = liked
    .map((l) => db.songs.find((s) => s.id === l.song_id))
    .filter(Boolean);

  if (likedSongs.length === 0) {
    // 좋아요가 없으면 인기곡
    let popular = db.songs.map((s) => {
      const like_count = db.likes.filter((l) => l.song_id === s.id).length;
      return { ...s, like_count };
    });

    popular.sort((a, b) => {
      if (b.like_count === a.like_count) {
        return new Date(b.created_at) - new Date(a.created_at);
      }
      return b.like_count - a.like_count;
    });

    return res.json(popular.slice(0, 20));
  }

  // 2) 장르 선호도
  const genreCount = {};
  likedSongs.forEach((s) => {
    genreCount[s.genre] = (genreCount[s.genre] || 0) + 1;
  });

  const genresSorted = Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g);
  const topGenres = genresSorted.slice(0, 2);

  // 3) 아직 좋아요 안 한 곡 후보
  const likedSongIds = new Set(liked.map((l) => l.song_id));
  const candidates = db.songs.filter((s) => !likedSongIds.has(s.id));

  const now = Date.now();

  const scored = candidates.map((song) => {
    let score = 0;

    // 장르 매칭
    if (topGenres.includes(song.genre)) score += 3;

    // 좋아요 수
    const like_count = db.likes.filter((l) => l.song_id === song.id).length;
    score += like_count;

    // 최신성
    const createdAt = new Date(song.created_at).getTime();
    const days = (now - createdAt) / (1000 * 60 * 60 * 24);
    if (days < 3) score += 2;
    else if (days < 7) score += 1;

    return { ...song, like_count, score };
  });

  scored.sort((a, b) => b.score - a.score);
  res.json(scored.slice(0, 20));
});

// ----- 4. 장르 목록 -----
app.get("/api/genres", authMiddleware, (req, res) => {
  const set = new Set(db.songs.map((s) => s.genre));
  const genres = Array.from(set).sort();
  res.json(genres);
});
// ----- 내가 좋아요한 곡 목록 -----
app.get("/api/my-likes", authMiddleware, (req, res) => {
  const userId = req.user.id;

  const myLikes = db.likes.filter((l) => l.user_id === userId);

  if (myLikes.length === 0) {
    return res.json([]);
  }

  const likedAtMap = {};
  myLikes.forEach((l) => {
    likedAtMap[l.song_id] = l.created_at;
  });

  const result = myLikes
    .map((l) => {
      const song = db.songs.find((s) => s.id === l.song_id);
      if (!song) return null;

      const like_count = db.likes.filter((x) => x.song_id === song.id).length;
      return {
        ...song,
        like_count,
        liked_at: likedAtMap[song.id],
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        new Date(b.liked_at).getTime() - new Date(a.liked_at).getTime()
    );

  res.json(result);
});


// --- React 정적 파일 서빙 설정 ---
const clientBuildPath = path.join(__dirname, "..", "client", "dist");

// 정적 파일
app.use(express.static(clientBuildPath));

// SPA 라우팅 ( /api 로 시작하는 건 건드리지 않고 나머지는 전부 React로 보내기 )
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

// ----- 서버 시작 -----
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
