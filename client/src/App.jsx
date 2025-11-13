import { useEffect, useState, useCallback } from "react";

const GENRE_OPTIONS = [
  "발라드",
  "댄스",
  "힙합",
  "R&B / Soul",
  "록 / 메탈",
  "인디",
  "POP",
  "J-POP",
  "기타",
];

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

const MAX_RECS_PREVIEW = 3;
const MAX_SONGS_PREVIEW = 3;

function App() {
  const [user, setUser] = useState(null);
  const [nickname, setNickname] = useState("");
  const [songs, setSongs] = useState([]);
  const [genreFilter, setGenreFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [genres, setGenres] = useState([]);
  const [recs, setRecs] = useState([]);

  const [newSong, setNewSong] = useState({
    title: "",
    artist: "",
    genre: "",
    youtubeUrl: "",
  });

  const [loading, setLoading] = useState(true);

  // home | recs | songs
  const [view, setView] = useState("home");

  // 첫 진입 시 로그인 상태 확인
  useEffect(() => {
    fetch(`${API_BASE}/me`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        setUser(data);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // 데이터 로더들
  const loadSongs = useCallback(() => {
    const params = new URLSearchParams();
    if (genreFilter && genreFilter !== "all") params.append("genre", genreFilter);
    if (sort) params.append("sort", sort);

    fetch(`${API_BASE}/songs?${params.toString()}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then(setSongs)
      .catch(console.error);
  }, [genreFilter, sort]);

  const loadGenres = useCallback(() => {
    setGenres(GENRE_OPTIONS);
  }, []);

  const loadRecommendations = useCallback(() => {
    fetch(`${API_BASE}/recommendations`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then(setRecs)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (user) {
      loadSongs();
      loadGenres();
      loadRecommendations();
    }
  }, [user, loadSongs, loadGenres, loadRecommendations]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!nickname.trim()) return;

    fetch(`${API_BASE}/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("로그인 실패");
        return res.json();
      })
      .then((data) => {
        setUser(data);
      })
      .catch((e) => alert(e.message));
  };

  const handleLogout = () => {
    fetch(`${API_BASE}/logout`, {
      method: "POST",
      credentials: "include",
    }).finally(() => {
      setUser(null);
      setSongs([]);
      setRecs([]);
      setView("home");
    });
  };

  const handleNewSongChange = (e) => {
    const { name, value } = e.target;
    setNewSong((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddSong = (e) => {
    e.preventDefault();
    const { title, artist, genre, youtubeUrl } = newSong;
    if (!title || !artist || !genre || !youtubeUrl) {
      alert("모든 필드를 입력하세요.");
      return;
    }

    fetch(`${API_BASE}/songs`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSong),
    })
      .then((res) => {
        if (!res.ok) throw new Error("노래 등록 실패");
        return res.json();
      })
      .then(() => {
        setNewSong({
          title: "",
          artist: "",
          genre: "",
          youtubeUrl: "",
        });
        loadSongs();
        loadGenres();
        loadRecommendations();
      })
      .catch((e) => alert(e.message));
  };

  const toggleLike = (songId) => {
    fetch(`${API_BASE}/songs/${songId}/like`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.json())
      .then(() => {
        loadSongs();
        loadRecommendations();
      })
      .catch(console.error);
  };

  if (loading) {
    return (
      <div className="app-root">
        <div className="app-center-message">로딩중...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-root">
        <div className="auth-card">
          <h1 className="logo-text">소소한 음악 추천</h1>
          <p className="auth-subtitle">지인들끼리만 쓰는 작은 플레이리스트</p>
          <form onSubmit={handleLogin} className="auth-form">
            <label className="field">
              <span className="field-label">닉네임</span>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="text-input"
                placeholder="닉네임을 입력하세요"
              />
            </label>
            <button type="submit" className="primary-btn">
              입장하기
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <div className="app-shell">
        <header className="app-header">
          <div className="logo-area" onClick={() => setView("home")} style={{ cursor: "pointer" }}>
            <div className="logo-dot" />
            <span className="logo-text">소소한 음악 추천</span>
          </div>
          <div className="header-right">
            <span className="user-chip">{user.nickname} 님</span>
            <button className="ghost-btn" onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </header>

        <main className="layout">
          {view === "home" ? (
            <>
              {/* 왼쪽: 입력 + 필터 */}
              <section className="left-pane">
                <div className="card">
                  <h2 className="card-title">노래 등록</h2>
                  <p className="card-subtitle">요즘 빠져있는 곡을 공유해보세요.</p>
                  <form onSubmit={handleAddSong} className="form-grid">
                    <label className="field">
                      <span className="field-label">제목</span>
                      <input
                        type="text"
                        name="title"
                        value={newSong.title}
                        onChange={handleNewSongChange}
                        className="text-input"
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">가수</span>
                      <input
                        type="text"
                        name="artist"
                        value={newSong.artist}
                        onChange={handleNewSongChange}
                        className="text-input"
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">장르</span>
                      <select
                        name="genre"
                        value={newSong.genre}
                        onChange={handleNewSongChange}
                        className="select-input"
                      >
                        <option value="">장르 선택</option>
                        {GENRE_OPTIONS.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="field-label">유튜브 링크</span>
                      <input
                        type="text"
                        name="youtubeUrl"
                        value={newSong.youtubeUrl}
                        onChange={handleNewSongChange}
                        className="text-input"
                        placeholder="https://www.youtube.com/watch?v=..."
                      />
                    </label>
                    <button type="submit" className="primary-btn full-width">
                      등록하기
                    </button>
                  </form>
                </div>

                <div className="card">
                  <h3 className="card-title">장르 / 정렬</h3>
                  <div className="filter-row">
                    <div className="field">
                      <span className="field-label">장르</span>
                      <select
                        value={genreFilter}
                        onChange={(e) => setGenreFilter(e.target.value)}
                        className="select-input"
                      >
                        <option value="all">전체</option>
                        {genres.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <span className="field-label">정렬</span>
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                        className="select-input"
                      >
                        <option value="recent">최신순</option>
                        <option value="popular">인기순</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              {/* 오른쪽: 추천 + 리스트 (프리뷰) */}
              <section className="right-pane">
                <div className="card">
                  <h2 className="card-title">추천 노래</h2>
                  <p className="card-subtitle">
                    내가 좋아한 곡과 비슷한 취향의 노래를 모아서 보여줘요.
                  </p>
                  {recs.length === 0 ? (
                    <div className="empty-state">
                      아직 추천할 곡이 없습니다. 마음에 드는 곡에 좋아요를 눌러보세요!
                    </div>
                  ) : (
                    <>
                      <SongList
                        songs={recs.slice(0, MAX_RECS_PREVIEW)}
                        onToggleLike={toggleLike}
                      />
                      {recs.length > MAX_RECS_PREVIEW && (
                        <button
                          className="ghost-btn more-btn"
                          onClick={() => setView("recs")}
                        >
                          추천 더보기
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="card">
                  <h2 className="card-title">전체 / 장르별 노래</h2>
                  {songs.length === 0 ? (
                    <div className="empty-state">
                      아직 등록된 곡이 없습니다. 첫 곡의 주인공이 되어보세요.
                    </div>
                  ) : (
                    <>
                      <SongList
                        songs={songs.slice(0, MAX_SONGS_PREVIEW)}
                        onToggleLike={toggleLike}
                      />
                      {songs.length > MAX_SONGS_PREVIEW && (
                        <button
                          className="ghost-btn more-btn"
                          onClick={() => setView("songs")}
                        >
                          전체 더보기
                        </button>
                      )}
                    </>
                  )}
                </div>
              </section>
            </>
          ) : (
            // 추천 전체 / 전체 리스트 전용 화면
            <section className="right-pane" style={{ gridColumn: "1 / -1" }}>
              <div className="card">
                <div className="card-header-row">
                  <div>
                    <h2 className="card-title">
                      {view === "recs" ? "추천 노래 모아보기" : "전체 / 장르별 노래 모아보기"}
                    </h2>
                    <p className="card-subtitle">
                      {view === "recs"
                        ? "내가 누른 좋아요를 기준으로 추천된 곡들을 한 번에 모아봤어요."
                        : "현재 필터 / 정렬 기준에 맞는 모든 곡을 한 번에 볼 수 있어요."}
                    </p>
                  </div>
                  <button className="ghost-btn" onClick={() => setView("home")}>
                    ← 홈으로
                  </button>
                </div>

                {view === "songs" && (
                  <div className="filter-row" style={{ marginBottom: 16 }}>
                    <div className="field">
                      <span className="field-label">장르</span>
                      <select
                        value={genreFilter}
                        onChange={(e) => setGenreFilter(e.target.value)}
                        className="select-input"
                      >
                        <option value="all">전체</option>
                        {genres.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <span className="field-label">정렬</span>
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                        className="select-input"
                      >
                        <option value="recent">최신순</option>
                        <option value="popular">인기순</option>
                      </select>
                    </div>
                  </div>
                )}

                {view === "recs" ? (
                  recs.length === 0 ? (
                    <div className="empty-state">
                      아직 추천할 곡이 없습니다. 마음에 드는 곡에 좋아요를 눌러보세요!
                    </div>
                  ) : (
                    <SongList songs={recs} onToggleLike={toggleLike} />
                  )
                ) : songs.length === 0 ? (
                  <div className="empty-state">
                    아직 등록된 곡이 없습니다. 첫 곡의 주인공이 되어보세요.
                  </div>
                ) : (
                  <SongList songs={songs} onToggleLike={toggleLike} />
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function SongList({ songs, onToggleLike }) {
  return (
    <div className="song-list">
      {songs.map((song) => (
        <article key={song.id} className="song-item">
          <div className="song-main">
            <div className="song-title-row">
              <span className="song-title">{song.title}</span>
              <span className="song-artist">· {song.artist}</span>
            </div>
            <div className="song-meta">
              <span className="tag">{song.genre}</span>
              <span className="meta-text">좋아요 {song.like_count ?? 0}</span>
            </div>
            {song.youtube_url && (
              <a
                href={song.youtube_url}
                target="_blank"
                rel="noreferrer"
                className="link-btn"
              >
                유튜브에서 재생
              </a>
            )}
          </div>
          <button className="like-btn" onClick={() => onToggleLike(song.id)}>
            좋아요 / 취소
          </button>
        </article>
      ))}
    </div>
  );
}

export default App;
