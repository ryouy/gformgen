import { useEffect, useMemo, useRef, useState } from "react";
import AppMain from "./layout/AppMain";
import "./App.css";
import { apiUrl, authUrl } from "./lib/apiBase";
import { applyAppThemeToDom } from "./lib/appTheme";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { buildMuiTheme } from "./lib/muiTheme";

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("isLoggedIn") === "true";
  });
  const [logoutNoticeShown, setLogoutNoticeShown] = useState(false);
  const themeAppliedRef = useRef(false);
  const [appTheme, setAppTheme] = useState(() => {
    try {
      const cached = window.localStorage.getItem("gformgen.theme");
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return { accent: "#6b7280", scope: "sidebar" };
  });

  const syncLoginStateFromServer = async ({ keepCurrentOnError = false } = {}) => {
    try {
      const res = await fetch(authUrl("/auth/me"), { credentials: "include" });
      if (!res.ok) throw new Error("me_failed");
      const data = await res.json().catch(() => ({}));
      const loggedIn = Boolean(data?.loggedIn);
      setIsLoggedIn(loggedIn);

      if (typeof window !== "undefined") {
        if (loggedIn) window.localStorage.setItem("isLoggedIn", "true");
        else window.localStorage.removeItem("isLoggedIn");
      }
      return { ok: true, loggedIn };
    } catch {
      // Backend unreachable / cold start etc.
      if (!keepCurrentOnError) {
        // Default: treat as logged out to avoid stale UI.
        setIsLoggedIn(false);
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("isLoggedIn");
        }
      }
      return { ok: false, loggedIn: null };
    }
  };

  // 🔁 起動時にサーバ基準でログイン状態を同期（OAuth直後はコールドスタート対策でリトライ）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const justLoggedIn = params.get("login") === "success";

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const run = async () => {
      if (justLoggedIn) {
        // まずはUIをログイン扱いに（/auth/me が一瞬失敗してもサイドバーが古いままにならない）
        setIsLoggedIn(true);
        try {
          window.localStorage.setItem("isLoggedIn", "true");
        } catch {
          // ignore
        }

        // URLをきれいにする（login=success を消す。配信パス（BASE_URL）を壊さない）
        try {
          const u = new URL(window.location.href);
          u.searchParams.delete("login");
          window.history.replaceState({}, "", `${u.pathname}${u.search}${u.hash}`);
        } catch {
          // ignore
        }

        // コールドスタート等で /auth/me が落ちることがあるので、少しリトライする
        for (let i = 0; i < 3; i += 1) {
          const r = await syncLoginStateFromServer({ keepCurrentOnError: true });
          if (r.ok && r.loggedIn === true) return;
          await sleep(350 * 2 ** i);
        }
        // 最後に通常同期（ダメなら未ログインへ）
        await syncLoginStateFromServer({ keepCurrentOnError: false });
        return;
      }

      await syncLoginStateFromServer({ keepCurrentOnError: false });
    };

    void run();
  }, []);

  // Apply per-user theme after login (Drive-backed settings).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isLoggedIn) {
        setAppTheme({
          accent: "#6b7280",
          scope: "sidebar",
          navPosition: "sidebar",
          navLabelMode: "icon",
        });
        applyAppThemeToDom({ accent: "#6b7280", scope: "sidebar" });
        themeAppliedRef.current = false;
        return;
      }

      // Fast path: apply cached theme immediately (no network wait).
      if (!themeAppliedRef.current) {
        try {
          const cached = window.localStorage.getItem("gformgen.theme");
          if (cached) {
            const s = JSON.parse(cached);
            setAppTheme({
              accent: s?.accent || "#6b7280",
              scope: s?.scope || "sidebar",
            navPosition: s?.navPosition || "sidebar",
            navLabelMode: s?.navLabelMode || "icon",
            });
            applyAppThemeToDom(s);
          }
        } catch {
          // ignore
        }
        themeAppliedRef.current = true;
      }

      try {
        const res = await fetch(apiUrl("/user-settings/theme"), { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const s = data?.settings || {};
        setAppTheme({
          accent: s?.accent || "#6b7280",
          scope: s?.scope || "sidebar",
            navPosition: s?.navPosition || "sidebar",
            navLabelMode: s?.navLabelMode || "icon",
        });
        applyAppThemeToDom(s);
        try {
          window.localStorage.setItem("gformgen.theme", JSON.stringify(s));
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  // Keep appTheme in sync when Settings page toggles theme/layout etc.
  useEffect(() => {
    const onTheme = (e) => {
      const d = e?.detail || {};
      if (!d?.accent) return;
      setAppTheme((prev) => ({
        ...prev,
        accent: d.accent,
        scope: d.scope ?? prev.scope,
        navPosition: d.navPosition ?? prev.navPosition,
        navLabelMode: d.navLabelMode ?? prev.navLabelMode,
      }));
    };
    window.addEventListener("gformgen:theme", onTheme);
    return () => window.removeEventListener("gformgen:theme", onTheme);
  }, []);

  const muiTheme = useMemo(() => buildMuiTheme(appTheme), [appTheme]);

  // Safari等で OAuth 後に BFCache から復帰すると、初期useEffectが再実行されずUIが古いままになることがある。
  // pageshow で復帰を検知してログイン状態を再同期する。
  useEffect(() => {
    if (typeof window === "undefined") return;

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const onPageShow = async () => {
      const params = new URLSearchParams(window.location.search);
      const justLoggedIn = params.get("login") === "success";

      if (justLoggedIn) {
        setIsLoggedIn(true);
        try {
          window.localStorage.setItem("isLoggedIn", "true");
        } catch {
          // ignore
        }

        try {
          const u = new URL(window.location.href);
          u.searchParams.delete("login");
          window.history.replaceState({}, "", `${u.pathname}${u.search}${u.hash}`);
        } catch {
          // ignore
        }

        for (let i = 0; i < 3; i += 1) {
          const r = await syncLoginStateFromServer({ keepCurrentOnError: true });
          if (r.ok && r.loggedIn === true) return;
          await sleep(350 * 2 ** i);
        }
        await syncLoginStateFromServer({ keepCurrentOnError: false });
        return;
      }

      // 通常復帰でも一度同期しておく
      await syncLoginStateFromServer({ keepCurrentOnError: false });
    };

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // 念のため：存在しないホームパスに戻されてもアプリ入口（BASE_URL）に寄せる
  useEffect(() => {
    if (typeof window === "undefined") return;
    const base = (import.meta?.env?.BASE_URL || "/").replace(/\/?$/, "/");
    if (window.location.pathname === "/home" || window.location.pathname === "/home/") {
      window.history.replaceState({}, "", base);
    }
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(authUrl("/auth/logout"), { method: "POST", credentials: "include" });
    } catch (err) {
      console.error("Failed to logout:", err);
    } finally {
      setIsLoggedIn(false);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("isLoggedIn");
        window.localStorage.removeItem("sangaku.selectedFormId");
      }
    }
  };

  const handleLogin = () => {
    const basePath = (import.meta?.env?.BASE_URL || "/").replace(/\/?$/, "/");
    const returnTo =
      typeof window !== "undefined"
        ? encodeURIComponent(`${window.location.origin}${basePath}`)
        : "";
    window.location.href = authUrl(`/auth/google?returnTo=${returnTo}`);
  };

  // バックエンド再起動などで 401 が出たら、フロントを強制的に未ログインへ戻す
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onUnauthorized = (ev) => {
      setLogoutNoticeShown(true);

      const wasLoggedIn =
        typeof window !== "undefined" && window.localStorage.getItem("isLoggedIn") === "true";

      setIsLoggedIn(false);
      window.localStorage.removeItem("isLoggedIn");
      window.localStorage.removeItem("sangaku.selectedFormId");

      // ポップアップは出さない（うるさいため）。必要ならコンソールにだけ残す。
      const fallback = wasLoggedIn
        ? "ログイン状態が切れました。再ログインしてください。"
        : "ログインが必要です。";
      const msg = ev?.detail?.message || fallback;
      console.info("[auth] unauthorized:", msg);
    };

    window.addEventListener("gformgen:unauthorized", onUnauthorized);
    return () => {
      window.removeEventListener("gformgen:unauthorized", onUnauthorized);
    };
  }, [logoutNoticeShown]);

  // タブ復帰時にサーバ基準で再同期（cookie切れ/関数再デプロイ等に追従）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFocus = () => {
      void syncLoginStateFromServer();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // ホーム画面は廃止し、常にメインUIを表示（ログイン/ログアウトはサイドバーで実施）
  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
    <AppMain
      theme="sangaku"
      isLoggedIn={isLoggedIn}
      onLogin={handleLogin}
      onLogout={handleLogout}
      navPosition={appTheme?.navPosition || "sidebar"}
      navLabelMode={appTheme?.navLabelMode || "icon"}
    />
    </ThemeProvider>
  );
}
