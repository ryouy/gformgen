import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { google } from "googleapis";
import { logEvent, requestLogger, readRecentLogLines } from "./logger.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(requestLogger);

const PORT = 3000;
const FORM_NAME_TAG = "[gformgen:sangaku]"; // Drive検索で「このアプリが作ったフォーム」を判別するタグ
const FORM_CLOSED_TAG = "[gformgen:closed]"; // アプリ上の「締切」判定用タグ（Forms APIで受付停止ができないため）

/* =========================
   Google OAuth 設定
========================= */
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost:3000/auth/google/callback"
);

// 開発用：メモリ保持
let savedTokens = null;

/* =========================
   OAuth 開始
========================= */
app.get("/auth/google", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/forms.body",
      "https://www.googleapis.com/auth/forms.responses.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
  res.redirect(authUrl);
});

/* =========================
   OAuth コールバック
========================= */
app.get("/auth/google/callback", async (req, res) => {
  try {
    const { tokens } = await oauth2Client.getToken(req.query.code);
    savedTokens = tokens;
    oauth2Client.setCredentials(tokens);

    void logEvent({
      type: "oauth_success",
    });
    res.redirect("http://localhost:5173/?login=success");
  } catch (err) {
    console.error(err);
    void logEvent({
      type: "oauth_error",
      message: err?.message || String(err),
    });
    res.status(500).send("OAuth failed");
  }
});

/* =========================
   日付日本語整形
========================= */
const formatDateJP = (isoString, withTime = false) => {
  if (!isoString) return "";

  const d = new Date(isoString);
  const week = ["日", "月", "火", "水", "木", "金", "土"];

  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const w = week[d.getDay()];

  if (withTime) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}年${m}月${day}日（${w}）${hh}:${mm}`;
  }

  return `${y}年${m}月${day}日（${w}）`;
};

/* =========================
   Forms: 回答/設問ユーティリティ
========================= */
async function listAllFormResponses(forms, formId) {
  const responses = [];
  let nextPageToken = undefined;

  do {
    const result = await forms.forms.responses.list({
      formId,
      pageSize: 200,
      pageToken: nextPageToken,
    });

    const pageResponses = result?.data?.responses || [];
    responses.push(...pageResponses);
    nextPageToken = result?.data?.nextPageToken;
  } while (nextPageToken);

  return { responses, nextPageToken: null };
}

async function buildQuestionIdToTitleMap(forms, formId) {
  const result = await forms.forms.get({ formId });
  const items = result?.data?.items || [];

  /** @type {Map<string, string>} */
  const map = new Map();

  for (const item of items) {
    const questionId = item?.questionItem?.question?.questionId;
    const title = item?.title;
    if (!questionId || !title) continue;
    map.set(String(questionId), String(title));
  }

  return map;
}

function getAnswerValue(answer) {
  return (
    answer?.textAnswers?.answers?.[0]?.value ??
    answer?.textAnswer?.value ?? // 念のため
    ""
  );
}

function isParticipantNameTitle(title) {
  const t = String(title || "");
  // 新形式: "氏名（1）" / "参加者名（1）"
  // 旧形式: "氏名"
  // NOTE: 要件にある prefix 判定（例: "参加者名（"）にも将来対応しやすいよう緩めにしている
  return (
    t.includes("参加者名（") ||
    t.includes("氏名（") ||
    t.includes("氏名(") ||
    t === "氏名"
  );
}

function isParticipantRoleTitle(title) {
  const t = String(title || "");
  return t.includes("役職名（") || t.includes("役職名(") || t === "役職名";
}

function parseIndexedFieldNumber(title) {
  const t = String(title || "");
  // 全角括弧: （1） / 半角: (1)
  const m1 = t.match(/（\s*(\d+)\s*）/);
  if (m1?.[1]) return Number(m1[1]);
  const m2 = t.match(/\(\s*(\d+)\s*\)/);
  if (m2?.[1]) return Number(m2[1]);
  return null;
}

function extractGoogleApiError(err) {
  const status =
    err?.response?.status ||
    err?.code || // sometimes numeric
    null;
  const message =
    err?.response?.data?.error?.message ||
    err?.message ||
    String(err);
  return {
    status: typeof status === "number" ? status : null,
    message,
  };
}

function parseAcceptingResponsesFromTitle(title) {
  // NOTE: Google Forms APIでは「回答受付停止」を直接更新できないため、
  // アプリ側ではタイトルにタグを付けて締切状態を表現する。
  const t = String(title || "");
  if (t.includes(FORM_CLOSED_TAG)) return false;
  if (t.includes(FORM_NAME_TAG)) return true;
  return null;
}

function stripTagsFromTitle(title) {
  return String(title || "")
    .replace(`${FORM_NAME_TAG} `, "")
    .replace(`${FORM_CLOSED_TAG} `, "")
    .replace(FORM_NAME_TAG, "")
    .replace(FORM_CLOSED_TAG, "")
    .trim();
}

/* =========================
   フォーム作成 API
========================= */
app.post("/api/forms/create", async (req, res) => {
  try {
    if (!savedTokens) {
      void logEvent({
        type: "forms_create_rejected",
        reason: "not_logged_in",
      });
      return res.status(401).json({ error: "Not logged in" });
    }

    oauth2Client.setCredentials(savedTokens);

    const {
      title,
      content,
      datetime,
      deadline,
      place,
      host,
      participantNameCount,
    } = req.body;

    const parsedCount = Number(participantNameCount);
    const safeParticipantNameCount = Number.isFinite(parsedCount)
      ? Math.max(1, Math.min(20, Math.floor(parsedCount)))
      : 1;

    // ★ Drive / Forms に表示される最終タイトル
    const baseTitle = title ? `${title} 出席通知書` : "出席通知書";
    const formTitle = `${FORM_NAME_TAG} ${baseTitle}`;

    console.log("受け取ったフォームデータ:", req.body);
    void logEvent({
      type: "forms_create_requested",
      // Avoid PII-heavy payloads; keep only high-level fields.
      formTitle,
      hasContent: Boolean(content),
      hasDatetime: Boolean(datetime),
      hasDeadline: Boolean(deadline),
      participantNameCount: safeParticipantNameCount,
    });

    /* =========================
       説明文（通知文）
    ========================= */
    const description = `
${formTitle}

平素より当協会の活動にご理解とご協力を賜り、誠にありがとうございます。
下記のとおり【${title}】を開催いたします。
ご出欠につきまして、以下のフォームよりご回答くださいますようお願い申し上げます。

【会合情報】
・主催者： ${host}
・日時： ${formatDateJP(datetime, true)}
・場所： ${place}
・〆切： ${formatDateJP(deadline)}

【お問い合わせ先】
会津産学懇話会 事務局
（TEL）23-8511（会津地区経営者協会内）
`.trim();

    const forms = google.forms({
      version: "v1",
      auth: oauth2Client,
    });

    /* =========================
       ① フォーム作成（仮）
    ========================= */
    const createResult = await forms.forms.create({
      requestBody: {
        info: {
          title: formTitle, // 仮でもOK
        },
      },
    });

    const formId = createResult.data.formId;
    const responderUri = createResult.data.responderUri;

    /* =========================
       ② batchUpdate（★ここが重要）
    ========================= */
    const requests = [];
    // ★ タイトル + 説明文を明示的に更新
    requests.push({
      updateFormInfo: {
        info: {
          title: formTitle,
          description,
        },
        updateMask: "title,description",
      },
    });

    // 事業所名
    requests.push({
      createItem: {
        item: {
          title: "事業所名",
          questionItem: {
            question: {
              required: true,
              textQuestion: {},
            },
          },
        },
        location: { index: 0 },
      },
    });

    // 役職名（n）/ 氏名（n）: 氏名の1人目のみ必須、2人目以降は任意
    // 役職名は全て任意（入力負担を増やさない）
    let cursorIndex = 1;
    for (let i = 1; i <= safeParticipantNameCount; i += 1) {
      // 役職名（i）
      requests.push({
        createItem: {
          item: {
            title: `役職名（${i}）`,
            questionItem: {
              question: {
                required: false,
                textQuestion: {},
              },
            },
          },
          location: { index: cursorIndex },
        },
      });
      cursorIndex += 1;

      // 氏名（i）
      requests.push({
        createItem: {
          item: {
            title: `氏名（${i}）`,
            questionItem: {
              question: {
                required: i === 1,
                textQuestion: {},
              },
            },
          },
          location: { index: cursorIndex },
        },
      });
      cursorIndex += 1;
    }

    const attendanceIndex = cursorIndex;
    // 出欠
    requests.push({
      createItem: {
        item: {
          title: "出席／欠席",
          questionItem: {
            question: {
              required: true,
              choiceQuestion: {
                type: "RADIO",
                options: [{ value: "出席" }, { value: "欠席" }],
              },
            },
          },
        },
        location: { index: attendanceIndex },
      },
    });

    // 備考
    requests.push({
      createItem: {
        item: {
          title: "備考",
          questionItem: {
            question: {
              required: false,
              textQuestion: {
                paragraph: true,
              },
            },
          },
        },
        location: { index: attendanceIndex + 1 },
      },
    });

    await forms.forms.batchUpdate({
      formId,
      requestBody: {
        requests,
      },
    });

    const drive = google.drive({
      version: "v3",
      auth: oauth2Client,
    });

    await drive.files.update({
      fileId: formId,
      requestBody: {
        name: formTitle,
      },
    });

    /* =========================
       フロントへ返却
    ========================= */
    void logEvent({
      type: "forms_create_succeeded",
      formId,
    });
    res.json({
      formId,
      formUrl: responderUri,
    });
  } catch (err) {
    console.error(err);
    void logEvent({
      type: "forms_create_failed",
      message: err?.message || String(err),
    });
    res.status(500).json({ error: "Failed to create form" });
  }
});

/* =========================
   フォーム回答取得（RAW）
========================= */
app.get("/api/forms/:formId/responses/raw", async (req, res) => {
  const { formId } = req.params;

  try {
    if (!savedTokens) {
      void logEvent({
        type: "forms_responses_list_rejected",
        reason: "not_logged_in",
        formId,
      });
      return res.status(401).json({ error: "Not logged in" });
    }

    void logEvent({
      type: "forms_responses_list_requested",
      formId,
      mode: "raw",
    });

    oauth2Client.setCredentials(savedTokens);
    const forms = google.forms({ version: "v1", auth: oauth2Client });

    const { responses, nextPageToken } = await listAllFormResponses(forms, formId);

    void logEvent({
      type: "forms_responses_list_succeeded",
      formId,
      mode: "raw",
      count: responses.length,
    });

    return res.json({
      formId,
      responses,
      nextPageToken,
    });
  } catch (err) {
    console.error(err);
    void logEvent({
      type: "forms_responses_list_failed",
      formId,
      mode: "raw",
      message: err?.message || String(err),
    });
    return res.status(500).json({ error: "Failed to list responses" });
  }
});

/* =========================
   フォーム回答取得（整形）
========================= */
app.get("/api/forms/:formId/responses", async (req, res) => {
  const { formId } = req.params;

  try {
    if (!savedTokens) {
      void logEvent({
        type: "forms_responses_list_rejected",
        reason: "not_logged_in",
        formId,
      });
      return res.status(401).json({ error: "Not logged in" });
    }

    void logEvent({
      type: "forms_responses_list_requested",
      formId,
      mode: "formatted",
    });

    oauth2Client.setCredentials(savedTokens);
    const forms = google.forms({ version: "v1", auth: oauth2Client });

    const questionIdToTitle = await buildQuestionIdToTitleMap(forms, formId);
    const { responses } = await listAllFormResponses(forms, formId);

    const rows = responses.map((r) => {
      const answers = r?.answers || {};

      const row = {
        company: "",
        role: "",
        name: "",
        attendance: "",
        count: 0,
        remarks: "",
        submittedAt: r?.lastSubmittedTime || "",
      };

      /** @type {Record<string, string>} */
      const rolesByIdx = {};
      /** @type {Record<string, string>} */
      const namesByIdx = {};

      for (const [questionId, answer] of Object.entries(answers)) {
        const title = questionIdToTitle.get(String(questionId)) || "";
        const value = getAnswerValue(answer);
        if (!title) continue;

        // タイトル部分一致で分類
        if (title.includes("事業所")) {
          row.company = value;
          continue;
        }
        if (title.includes("出席")) {
          row.attendance = value;
          continue;
        }
        if (title.includes("備考")) {
          row.remarks = value;
          continue;
        }

        // 役職名（n） / 役職名
        if (isParticipantRoleTitle(title)) {
          const idx = parseIndexedFieldNumber(title) ?? 1;
          const v = String(value || "").trim();
          if (v) rolesByIdx[String(idx)] = v;
          else if (title === "役職名" && !rolesByIdx["1"]) rolesByIdx["1"] = "";
          continue;
        }

        // 氏名（n） / 氏名 / 参加者名（n）
        if (isParticipantNameTitle(title)) {
          const idx = parseIndexedFieldNumber(title) ?? 1;
          const v = String(value || "").trim();
          if (v) namesByIdx[String(idx)] = v;
          else if (title === "氏名" && !namesByIdx["1"]) namesByIdx["1"] = "";
          continue;
        }
      }

      const idxs = Array.from(
        new Set([
          ...Object.keys(namesByIdx),
          ...Object.keys(rolesByIdx),
        ])
      )
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);

      const names = [];
      const roles = [];
      for (const i of idxs) {
        const name = String(namesByIdx[String(i)] || "").trim();
        const role = String(rolesByIdx[String(i)] || "").trim();
        if (name) names.push(name);
        if (role) roles.push(role);
      }

      row.name = names.join(" / ");
      row.role = roles.join(" / ");
      const participantCount = names.length;
      if (row.attendance === "出席") row.count = participantCount || 1;
      else if (row.attendance === "欠席") row.count = 0;
      else row.count = participantCount || 0;

      return row;
    });

    void logEvent({
      type: "forms_responses_list_succeeded",
      formId,
      mode: "formatted",
      count: rows.length,
    });

    return res.json({ formId, rows });
  } catch (err) {
    console.error(err);
    void logEvent({
      type: "forms_responses_list_failed",
      formId,
      mode: "formatted",
      message: err?.message || String(err),
    });
    return res.status(500).json({ error: "Failed to list responses" });
  }
});

/* =========================
   フォーム別サマリー（出席者数/回答者数）
========================= */
app.get("/api/forms/:formId/summary", async (req, res) => {
  const { formId } = req.params;

  try {
    if (!savedTokens) {
      void logEvent({
        type: "forms_summary_rejected",
        reason: "not_logged_in",
        formId,
      });
      return res.status(401).json({ error: "Not logged in" });
    }

    void logEvent({ type: "forms_summary_requested", formId });
    oauth2Client.setCredentials(savedTokens);
    const forms = google.forms({ version: "v1", auth: oauth2Client });

    const questionIdToTitle = await buildQuestionIdToTitleMap(forms, formId);
    const { responses } = await listAllFormResponses(forms, formId);

    const responseCount = responses.length;
    let attendeeCount = 0;

    for (const r of responses) {
      const answers = r?.answers || {};
      // 出席者数は「出席回答」のみを集計対象とする
      let attendance = "";
      for (const [questionId, answer] of Object.entries(answers)) {
        const title = questionIdToTitle.get(String(questionId)) || "";
        if (!title) continue;
        if (!title.includes("出席")) continue;
        attendance = String(getAnswerValue(answer) || "").trim();
        break;
      }
      if (attendance !== "出席") continue;

      for (const [questionId, answer] of Object.entries(answers)) {
        const title = questionIdToTitle.get(String(questionId)) || "";
        if (!title) continue;
        if (!isParticipantNameTitle(title)) continue;
        const v = String(getAnswerValue(answer) || "").trim();
        if (v) attendeeCount += 1;
      }
    }

    void logEvent({
      type: "forms_summary_succeeded",
      formId,
      responseCount,
      attendeeCount,
    });
    return res.json({ formId, responseCount, attendeeCount });
  } catch (err) {
    console.error(err);
    const { status, message } = extractGoogleApiError(err);
    void logEvent({
      type: "forms_summary_failed",
      formId,
      message,
    });
    return res
      .status(status || 500)
      .json({ error: message || "Failed to get summary" });
  }
});

/* =========================
   このアプリが作成したフォーム一覧（Drive検索）
========================= */
app.get("/api/forms/list", async (req, res) => {
  try {
    if (!savedTokens) {
      void logEvent({
        type: "forms_list_rejected",
        reason: "not_logged_in",
      });
      return res.status(401).json({ error: "Not logged in" });
    }

    void logEvent({ type: "forms_list_requested" });

    oauth2Client.setCredentials(savedTokens);
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // drive.file の範囲内で、タグ付きのGoogleフォームのみ抽出
    const q = [
      "trashed = false",
      "mimeType = 'application/vnd.google-apps.form'",
      `name contains '${FORM_NAME_TAG}'`,
    ].join(" and ");

    const result = await drive.files.list({
      q,
      orderBy: "createdTime desc",
      pageSize: 100,
      fields: "files(id,name,createdTime,modifiedTime)",
    });

    const files = result?.data?.files || [];
    // 締切状態はタイトルタグで判定（DBなし運用向け）
    const forms = files.map((f) => ({
      formId: f.id,
      title: f.name,
      createdTime: f.createdTime,
      modifiedTime: f.modifiedTime,
      acceptingResponses: parseAcceptingResponsesFromTitle(f.name), // true/false/null
    }));

    void logEvent({ type: "forms_list_succeeded", count: forms.length });
    return res.json({ forms });
  } catch (err) {
    console.error(err);
    void logEvent({
      type: "forms_list_failed",
      message: err?.message || String(err),
    });
    return res.status(500).json({ error: "Failed to list forms" });
  }
});

/* =========================
   フォーム情報取得（responderUriなど）
========================= */
app.get("/api/forms/:formId/info", async (req, res) => {
  const { formId } = req.params;

  try {
    if (!savedTokens) {
      void logEvent({
        type: "forms_info_rejected",
        reason: "not_logged_in",
        formId,
      });
      return res.status(401).json({ error: "Not logged in" });
    }

    void logEvent({ type: "forms_info_requested", formId });

    oauth2Client.setCredentials(savedTokens);
    const forms = google.forms({ version: "v1", auth: oauth2Client });

    const result = await forms.forms.get({ formId });
    const info = result?.data?.info || {};
    const responderUri = result?.data?.responderUri || "";
    const acceptingResponses = parseAcceptingResponsesFromTitle(info?.title);

    void logEvent({ type: "forms_info_succeeded", formId });
    return res.json({
      formId,
      title: info?.title || "",
      formUrl: responderUri,
      acceptingResponses, // true/false/null
    });
  } catch (err) {
    console.error(err);
    void logEvent({
      type: "forms_info_failed",
      formId,
      message: err?.message || String(err),
    });
    return res.status(500).json({ error: "Failed to get form info" });
  }
});

/* =========================
   フォーム締切（回答受付停止）
========================= */
app.post("/api/forms/:formId/close", async (req, res) => {
  const { formId } = req.params;
  try {
    if (!savedTokens) {
      void logEvent({
        type: "forms_close_rejected",
        reason: "not_logged_in",
        formId,
      });
      return res.status(401).json({ error: "Not logged in" });
    }

    void logEvent({ type: "forms_close_requested", formId });
    oauth2Client.setCredentials(savedTokens);

    const forms = google.forms({ version: "v1", auth: oauth2Client });
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // NOTE: Forms APIでは回答受付停止の切り替えが提供されていないため、
    // タイトル（Forms/Drive）へ締切タグを付ける＝アプリ上で締切扱いとする。
    const current = await forms.forms.get({ formId });
    const currentTitle = current?.data?.info?.title || "";
    if (currentTitle.includes(FORM_CLOSED_TAG)) {
      return res.json({ formId, acceptingResponses: false });
    }
    const base = stripTagsFromTitle(currentTitle);
    const nextTitle = `${FORM_NAME_TAG} ${FORM_CLOSED_TAG} ${base}`.trim();

    await forms.forms.batchUpdate({
      formId,
      requestBody: {
        requests: [
          {
            updateFormInfo: {
              info: {
                title: nextTitle,
              },
              updateMask: "title",
            },
          },
        ],
      },
    });

    // Drive側のファイル名も合わせる（検索/一覧用）
    await drive.files.update({
      fileId: formId,
      requestBody: { name: nextTitle },
    });

    void logEvent({ type: "forms_close_succeeded", formId });
    return res.json({ formId, acceptingResponses: false });
  } catch (err) {
    console.error(err);
    const { status, message } = extractGoogleApiError(err);
    void logEvent({
      type: "forms_close_failed",
      formId,
      message,
    });
    return res
      .status(status || 500)
      .json({ error: message || "Failed to close form" });
  }
});

/* =========================
   フォーム削除（Driveのゴミ箱へ移動）
========================= */
app.post("/api/forms/:formId/trash", async (req, res) => {
  const { formId } = req.params;
  try {
    if (!savedTokens) {
      void logEvent({
        type: "forms_trash_rejected",
        reason: "not_logged_in",
        formId,
      });
      return res.status(401).json({ error: "Not logged in" });
    }

    void logEvent({ type: "forms_trash_requested", formId });
    oauth2Client.setCredentials(savedTokens);
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    await drive.files.update({
      fileId: formId,
      requestBody: { trashed: true },
    });

    void logEvent({ type: "forms_trash_succeeded", formId });
    return res.json({ formId, trashed: true });
  } catch (err) {
    console.error(err);
    const { status, message } = extractGoogleApiError(err);
    void logEvent({
      type: "forms_trash_failed",
      formId,
      message,
    });
    return res
      .status(status || 500)
      .json({ error: message || "Failed to trash form" });
  }
});

/* =========================
   デバッグ用：最近のログ取得（任意）
   ENABLE_LOG_API=true の時のみ有効化
========================= */
if (process.env.ENABLE_LOG_API === "true") {
  app.get("/api/logs/recent", async (req, res) => {
    const limit = Number(req.query.limit ?? 200);
    const events = await readRecentLogLines(limit);
    res.json({ events });
  });
}

/* =========================
   ログアウト
========================= */
app.post("/auth/logout", (req, res) => {
  savedTokens = null;
  void logEvent({ type: "logout" });
  res.json({ success: true });
});

/* =========================
   サーバー起動
========================= */
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
