import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { google } from "googleapis";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

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
    scope: ["https://www.googleapis.com/auth/forms.body"],
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

    res.redirect("http://localhost:5173/?login=success");
  } catch (err) {
    console.error(err);
    res.status(500).send("OAuth failed");
  }
});
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
   フォーム作成 API
========================= */
app.post("/api/forms/create", async (req, res) => {
  try {
    if (!savedTokens) {
      return res.status(401).json({ error: "Not logged in" });
    }

    oauth2Client.setCredentials(savedTokens);

    const { title, content, datetime, deadline, place, host } = req.body;

    const formTitle = title ? `${title} 出席通知書` : "出席通知書";

    console.log("受け取ったフォームデータ:", req.body);

    /* =========================
       説明文（通知文）生成
    ========================= */
    const description = `
${title} 出席通知書

平素より当協会の活動にご理解とご協力を賜り、誠にありがとうございます。
下記のとおり【${title}】を開催いたします。
ご出欠につきまして、以下のフォームよりご回答くださいますようお願い申し上げます。

 会合情報
【主催者】： ${host}
【日時】： ${formatDateJP(datetime, true)}
【場所】： ${place}
【〆切】： ${formatDateJP(deadline)}

平素より当協会の活動にご理解とご協力を賜り、誠にありがとうございます。
下記のとおり定例会を開催いたします。
ご出欠につきまして、以下のフォームよりご回答くださいますようお願い申し上げますします。

【お問い合わせ先】
会津産学懇話会 事務局
（TEL）23-8511（会津地区経営者協会内）
`.trim();

    const forms = google.forms({
      version: "v1",
      auth: oauth2Client,
    });

    /* =========================
       フォーム作成
    ========================= */
    const createResult = await forms.forms.create({
      requestBody: {
        info: {
          title: formTitle,
        },
      },
    });

    const formId = createResult.data.formId;

    /* =========================
       質問追加
    ========================= */
    await forms.forms.batchUpdate({
      formId,
      requestBody: {
        requests: [
          // ★ 説明文を設定（B）
          {
            updateFormInfo: {
              info: {
                description,
              },
              updateMask: "description",
            },
          },

          // 事業所名
          {
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
          },

          // 役職名
          {
            createItem: {
              item: {
                title: "役職名",
                questionItem: {
                  question: {
                    required: false,
                    textQuestion: {},
                  },
                },
              },
              location: { index: 1 },
            },
          },

          // 氏名
          {
            createItem: {
              item: {
                title: "氏名",
                questionItem: {
                  question: {
                    required: true,
                    textQuestion: {},
                  },
                },
              },
              location: { index: 2 },
            },
          },

          // 出欠
          {
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
              location: { index: 3 },
            },
          },

          // 備考
          {
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
              location: { index: 4 },
            },
          },
        ],
      },
    });

    res.json({
      formId,
      formUrl: createResult.data.responderUri,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create form" });
  }
});

/* =========================
   ログアウト（トークン破棄）
========================= */
app.post("/auth/logout", (req, res) => {
  savedTokens = null;
  res.json({ success: true });
});

/* =========================
   サーバー起動
========================= */
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
