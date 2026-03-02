import { google } from "googleapis";
import { logEvent } from "./logger.js";
import {
  APP_PROP_APP_KEY,
  APP_PROP_APP_VALUE,
  APP_PROP_OWNER_SUB_KEY,
  APP_PROP_OWNER_EMAIL_KEY,
  APP_PROP_OWNER_NAME_KEY,
  APP_PROP_STATUS_KEY,
  APP_PROP_STATUS_CLOSED,
  CLOSED_NOTICE_TITLE,
  FORM_NAME_TAG,
  FORM_CLOSED_TAG,
} from "./constants.js";
import { buildClosedNoticeDescription, extractHostFromFormDescription } from "./constants.js";
import { parseIntInRange, extractGoogleApiError } from "./utils.js";
import { ensureToolFolderId, moveFileIntoFolderIfNeeded } from "./drive.js";
import {
  getTokens,
  makeAuthedOAuthClientOrNull,
  getAuthUserOrNull,
  enforceOwnerAccess,
} from "./auth.js";
import {
  formatDateJP,
  formatDateTimeRangeJP,
  listAllFormResponses,
  buildQuestionIdToTitleMapWithSnapshot,
  getAnswerValue,
  isParticipantNameTitle,
  isParticipantRoleTitle,
  parseIndexedFieldNumber,
  stripTagsFromTitle,
  parseAcceptingResponsesFromTitle,
  parseAcceptingResponsesFromAppProperties,
  migrateFileToAppProperties,
  upsertFormSnapshot,
} from "./formUtils.js";

export function mountFormsRoutes(app) {
  app.post("/api/forms/create", async (req, res) => {
    try {
      const savedTokens = getTokens(req);
      if (!savedTokens) {
        void logEvent({
          type: "forms_create_rejected",
          reason: "not_logged_in",
        });
        return res.status(401).json({ error: "Not logged in" });
      }

      const authClient = makeAuthedOAuthClientOrNull(req);
      if (!authClient) return res.status(401).json({ error: "Not logged in" });
      const authUser = await getAuthUserOrNull(req, res);

      const {
        title,
        datetime,
        endDatetime,
        deadline,
        place,
        price,
        host,
        participantNameCount,
      } = req.body;

      const parsedCount = Number(participantNameCount);
      const safeParticipantNameCount = Number.isFinite(parsedCount)
        ? Math.max(1, Math.min(20, Math.floor(parsedCount)))
        : 1;
      const safePrice = parseIntInRange(price, { min: 0, max: 99999999 }) ?? 0;

      const baseTitle = title ? `${title} 出欠通知書` : "出欠通知書";
      const formTitle = baseTitle;

      console.log("受け取ったフォームデータ:", req.body);
      void logEvent({
        type: "forms_create_requested",
        formTitle,
        hasDatetime: Boolean(datetime),
        hasEndDatetime: Boolean(endDatetime),
        hasDeadline: Boolean(deadline),
        hasPrice: price != null,
        participantNameCount: safeParticipantNameCount,
      });

      const formattedMeetingRange = formatDateTimeRangeJP(datetime, endDatetime);
      const meetingInfoLines = [
        `・日時： ${formattedMeetingRange}`,
        `・場所： ${place}`,
        safePrice > 0 ? `・参加費（1人あたり）：￥ ${safePrice}` : null,
        `・〆切： ${formatDateJP(deadline)}`,
      ]
        .filter(Boolean)
        .join("\n");

      const description = `
${formTitle}

平素より当協会の活動にご理解とご協力を賜り、誠にありがとうございます。
下記のとおり【${title}】を開催いたします。
ご出欠につきまして、以下のフォームよりご回答くださるようお願い申し上げます。

【会合情報】
${meetingInfoLines}

【お問合せ先】
 ${host} 事務局
（TEL）0242-23-8511
`.trim();

      const forms = google.forms({ version: "v1", auth: authClient });
      const drive = google.drive({ version: "v3", auth: authClient });

      const created = await forms.forms.create({
        requestBody: { info: { title: formTitle } },
      });
      const formId = String(created?.data?.formId || "").trim();
      if (!formId) throw new Error("Form create failed: missing formId");
      const toolFolderId = await ensureToolFolderId({ drive, authUser });
      if (toolFolderId) {
        await moveFileIntoFolderIfNeeded({ drive, fileId: formId, folderId: toolFolderId });
      }

      const requests = [];
      requests.push({
        updateFormInfo: {
          info: {
            title: formTitle,
            description,
          },
          updateMask: "title,description",
        },
      });

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
        },
        location: { index: 0 },
      });

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
        },
        location: { index: 1 },
      });

      const roleTitle = (i) =>
        safeParticipantNameCount === 1 ? "役職名" : `役職名（${i}人目）`;
      const nameTitle = (i) =>
        safeParticipantNameCount === 1 ? "氏名" : `氏名（${i}人目）`;

      let cursorIndex = 2;
      for (let i = 1; i <= safeParticipantNameCount; i += 1) {
        requests.push({
          createItem: {
            item: {
              title: roleTitle(i),
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

        requests.push({
          createItem: {
            item: {
              title: nameTitle(i),
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
        },
        location: { index: cursorIndex },
      });

      await forms.forms.batchUpdate({
        formId,
        requestBody: {
          requests,
        },
      });

      const ownerProps = authUser?.sub
        ? {
            [APP_PROP_OWNER_SUB_KEY]: String(authUser.sub),
            ...(authUser?.email ? { [APP_PROP_OWNER_EMAIL_KEY]: String(authUser.email) } : {}),
            ...(authUser?.name ? { [APP_PROP_OWNER_NAME_KEY]: String(authUser.name) } : {}),
          }
        : {};
      await drive.files.update({
        fileId: formId,
        requestBody: {
          name: formTitle,
          appProperties: {
            [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
            ...ownerProps,
          },
        },
      });

      const responderUri = String(created?.data?.responderUri || "").trim();

      void logEvent({
        type: "forms_create_succeeded",
        formId,
      });
      return res.json({ formId, formUrl: responderUri });
    } catch (err) {
      console.error(err);
      const { status, message } = extractGoogleApiError(err);
      void logEvent({
        type: "forms_create_failed",
        message: message || err?.message || String(err),
      });
      res
        .status(status || 500)
        .json({ error: message || "Failed to create form" });
    }
  });

  app.get("/api/forms/:formId/responses/raw", async (req, res) => {
    const { formId } = req.params;

    try {
      const savedTokens = getTokens(req);
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

      const authClient = makeAuthedOAuthClientOrNull(req);
      if (!authClient) return res.status(401).json({ error: "Not logged in" });
      const drive = google.drive({ version: "v3", auth: authClient });
      const access = await enforceOwnerAccess({ req, res, drive, formId });
      if (!access.ok) return res.status(access.status || 403).json({ error: access.error });
      const forms = google.forms({ version: "v1", auth: authClient });

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

  app.get("/api/forms/:formId/responses", async (req, res) => {
    const { formId } = req.params;

    try {
      const savedTokens = getTokens(req);
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

      const authClient = makeAuthedOAuthClientOrNull(req);
      if (!authClient) return res.status(401).json({ error: "Not logged in" });
      const drive = google.drive({ version: "v3", auth: authClient });
      const access = await enforceOwnerAccess({ req, res, drive, formId });
      if (!access.ok) return res.status(access.status || 403).json({ error: access.error });
      const forms = google.forms({ version: "v1", auth: authClient });

      const questionIdToTitle = await buildQuestionIdToTitleMapWithSnapshot({
        forms,
        drive,
        formId,
      });
      const { responses } = await listAllFormResponses(forms, formId);

      const parsedRows = responses.map((r) => {
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

          if (isParticipantRoleTitle(title)) {
            const idx = parseIndexedFieldNumber(title) ?? 1;
            const v = String(value || "").trim();
            if (v) rolesByIdx[String(idx)] = v;
            else if (title === "役職名" && !rolesByIdx["1"]) rolesByIdx["1"] = "";
            continue;
          }

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

      let postCloseSubmissionCount = 0;
      const filtered = parsedRows.filter((row) => {
        const isEmpty =
          !String(row?.company || "").trim() &&
          !String(row?.role || "").trim() &&
          !String(row?.name || "").trim() &&
          !String(row?.attendance || "").trim() &&
          !String(row?.remarks || "").trim();
        if (isEmpty) {
          postCloseSubmissionCount += 1;
          return false;
        }
        return true;
      });

      const rows = filtered.slice().sort((a, b) => {
        const ta = new Date(a?.submittedAt || 0).getTime();
        const tb = new Date(b?.submittedAt || 0).getTime();
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      });

      void logEvent({
        type: "forms_responses_list_succeeded",
        formId,
        mode: "formatted",
        count: rows.length,
        postCloseSubmissionCount,
      });

      return res.json({ formId, rows, postCloseSubmissionCount });
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

  app.get("/api/forms/:formId/summary", async (req, res) => {
    const { formId } = req.params;

    try {
      const savedTokens = getTokens(req);
      if (!savedTokens) {
        void logEvent({
          type: "forms_summary_rejected",
          reason: "not_logged_in",
          formId,
        });
        return res.status(401).json({ error: "Not logged in" });
      }

      void logEvent({ type: "forms_summary_requested", formId });
      const authClient = makeAuthedOAuthClientOrNull(req);
      if (!authClient) return res.status(401).json({ error: "Not logged in" });
      const drive = google.drive({ version: "v3", auth: authClient });
      const access = await enforceOwnerAccess({ req, res, drive, formId });
      if (!access.ok) return res.status(access.status || 403).json({ error: access.error });
      const forms = google.forms({ version: "v1", auth: authClient });

      const questionIdToTitle = await buildQuestionIdToTitleMapWithSnapshot({
        forms,
        drive,
        formId,
      });
      const { responses } = await listAllFormResponses(forms, formId);

      let responseCount = 0;
      let postCloseSubmissionCount = 0;
      let attendeeCount = 0;

      for (const r of responses) {
        const answers = r?.answers || {};
        let hasMeaningfulAnswer = false;

        for (const [questionId, answer] of Object.entries(answers)) {
          const title = questionIdToTitle.get(String(questionId)) || "";
          if (!title) continue;
          const value = String(getAnswerValue(answer) || "").trim();
          if (!value) continue;
          if (
            title.includes("事業所") ||
            title.includes("出席") ||
            title.includes("備考") ||
            isParticipantNameTitle(title) ||
            isParticipantRoleTitle(title)
          ) {
            hasMeaningfulAnswer = true;
            break;
          }
        }
        if (!hasMeaningfulAnswer) {
          postCloseSubmissionCount += 1;
          continue;
        }
        responseCount += 1;

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
        postCloseSubmissionCount,
      });
      return res.json({ formId, responseCount, attendeeCount, postCloseSubmissionCount });
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

  app.get("/api/forms/list", async (req, res) => {
    try {
      const savedTokens = getTokens(req);
      if (!savedTokens) {
        void logEvent({
          type: "forms_list_rejected",
          reason: "not_logged_in",
        });
        return res.status(401).json({ error: "Not logged in" });
      }

      void logEvent({ type: "forms_list_requested" });

      const authClient = makeAuthedOAuthClientOrNull(req);
      if (!authClient) return res.status(401).json({ error: "Not logged in" });
      const authUser = await getAuthUserOrNull(req, res);
      if (!authUser?.sub) {
        return res.status(401).json({ error: "Failed to determine logged-in user" });
      }
      const formsApi = google.forms({ version: "v1", auth: authClient });
      const drive = google.drive({ version: "v3", auth: authClient });

      const baseQ = [
        "trashed = false",
        "mimeType = 'application/vnd.google-apps.form'",
      ].join(" and ");

      const q1 = [
        baseQ,
        `appProperties has { key='${APP_PROP_APP_KEY}' and value='${APP_PROP_APP_VALUE}' }`,
      ].join(" and ");

      const result1 = await drive.files.list({
        q: q1,
        orderBy: "createdTime desc",
        pageSize: 100,
        fields: "files(id,name,createdTime,modifiedTime,appProperties,ownedByMe)",
      });

      const files1 = result1?.data?.files || [];

      const q2 = [baseQ, `name contains '${FORM_NAME_TAG}'`].join(" and ");
      const result2 = await drive.files.list({
        q: q2,
        orderBy: "createdTime desc",
        pageSize: 100,
        fields: "files(id,name,createdTime,modifiedTime,appProperties,ownedByMe)",
      });
      const files2 = result2?.data?.files || [];

      /** @type {Map<string, any>} */
      const byId = new Map();
      for (const f of [...files1, ...files2]) {
        if (!f?.id) continue;
        if (!byId.has(f.id)) byId.set(f.id, f);
      }
      const files = Array.from(byId.values());

      const migrateTargets = files.filter((f) => {
        const name = String(f?.name || "");
        const props = f?.appProperties || {};
        const hasApp = String(props?.[APP_PROP_APP_KEY] || "") === APP_PROP_APP_VALUE;
        const hasTag = name.includes(FORM_NAME_TAG) || name.includes(FORM_CLOSED_TAG);
        const hasOwner = Boolean(String(props?.[APP_PROP_OWNER_SUB_KEY] || "").trim());
        return !hasApp || hasTag || ((f?.ownedByMe === true) && !hasOwner);
      });

      for (let i = 0; i < migrateTargets.length; i += 5) {
        const chunk = migrateTargets.slice(i, i + 5);
        await Promise.allSettled(
          chunk.map((f) =>
            migrateFileToAppProperties({
              forms: formsApi,
              drive,
              file: f,
              authUser,
            })
          )
        );
      }

      const forms = files
        .filter((f) => {
          if (!authUser?.sub) return true;
          const props = f?.appProperties || {};
          const ownerSub = String(props?.[APP_PROP_OWNER_SUB_KEY] || "").trim();
          if (ownerSub) return ownerSub === String(authUser.sub).trim();
          return f?.ownedByMe === true;
        })
        .map((f) => {
          const cleanedTitle = stripTagsFromTitle(f.name) || f.name;
          const byProps = parseAcceptingResponsesFromAppProperties(f.appProperties);
          const byTitle = parseAcceptingResponsesFromTitle(f.name);
          return {
            formId: f.id,
            title: cleanedTitle,
            createdTime: f.createdTime,
            modifiedTime: f.modifiedTime,
            acceptingResponses: byProps ?? byTitle,
          };
        });

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

  app.get("/api/forms/:formId/info", async (req, res) => {
    const { formId } = req.params;

    try {
      const savedTokens = getTokens(req);
      if (!savedTokens) {
        void logEvent({
          type: "forms_info_rejected",
          reason: "not_logged_in",
          formId,
        });
        return res.status(401).json({ error: "Not logged in" });
      }

      void logEvent({ type: "forms_info_requested", formId });

      const authClient = makeAuthedOAuthClientOrNull(req);
      if (!authClient) return res.status(401).json({ error: "Not logged in" });
      const forms = google.forms({ version: "v1", auth: authClient });
      const drive = google.drive({ version: "v3", auth: authClient });
      const access = await enforceOwnerAccess({ req, res, drive, formId, requireApp: false });
      if (!access.ok) return res.status(access.status || 403).json({ error: access.error });

      const result = await forms.forms.get({ formId });
      const info = result?.data?.info || {};
      const responderUri = result?.data?.responderUri || "";
      const editUrl = `https://docs.google.com/forms/d/${encodeURIComponent(String(formId || "").trim())}/edit`;
      const driveFile = await drive.files.get({
        fileId: formId,
        fields: "id,name,appProperties,ownedByMe",
      });
      const driveName = driveFile?.data?.name || "";
      const appProps = driveFile?.data?.appProperties || {};

      const currentTitle = String(info?.title || "");
      const nextTitle = stripTagsFromTitle(currentTitle);
      const currentName = String(driveName || "");
      const nextName = stripTagsFromTitle(currentName);
      const acceptingFromTitle = parseAcceptingResponsesFromTitle(currentTitle) ?? true;
      const inferredStatus =
        acceptingFromTitle === false ? APP_PROP_STATUS_CLOSED : undefined;
      const byProps = parseAcceptingResponsesFromAppProperties(appProps);

      if (
        (currentTitle.includes(FORM_NAME_TAG) || currentTitle.includes(FORM_CLOSED_TAG)) ||
        (currentName.includes(FORM_NAME_TAG) || currentName.includes(FORM_CLOSED_TAG)) ||
        String(appProps?.[APP_PROP_APP_KEY] || "") !== APP_PROP_APP_VALUE
      ) {
        const { mergeAppProperties } = await import("./utils.js");
        try {
          if (nextTitle && nextTitle !== currentTitle) {
            await forms.forms.batchUpdate({
              formId,
              requestBody: {
                requests: [
                  {
                    updateFormInfo: {
                      info: { title: nextTitle },
                      updateMask: "title",
                    },
                  },
                ],
              },
            });
          }

          const nextProps = mergeAppProperties(appProps, {
            [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
            ...(inferredStatus ? { [APP_PROP_STATUS_KEY]: inferredStatus } : {}),
          });
          await drive.files.update({
            fileId: formId,
            requestBody: {
              name: nextName || nextTitle || currentName || currentTitle,
              appProperties: nextProps,
            },
          });
        } catch (e) {
          console.warn("migration failed:", e?.message || String(e));
        }
      }

      const acceptingResponses =
        byProps ?? parseAcceptingResponsesFromTitle(nextTitle || currentTitle);
      const titleToReturn = nextTitle || currentTitle || nextName || currentName;

      void logEvent({ type: "forms_info_succeeded", formId });
      return res.json({
        formId,
        title: titleToReturn || "",
        formUrl: responderUri,
        editUrl,
        acceptingResponses,
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

  app.post("/api/forms/:formId/close", async (req, res) => {
    const { formId } = req.params;
    try {
      const savedTokens = getTokens(req);
      if (!savedTokens) {
        void logEvent({
          type: "forms_close_rejected",
          reason: "not_logged_in",
          formId,
        });
        return res.status(401).json({ error: "Not logged in" });
      }

      void logEvent({ type: "forms_close_requested", formId });
      const authClient = makeAuthedOAuthClientOrNull(req);
      if (!authClient) return res.status(401).json({ error: "Not logged in" });

      const forms = google.forms({ version: "v1", auth: authClient });
      const drive = google.drive({ version: "v3", auth: authClient });
      const access = await enforceOwnerAccess({ req, res, drive, formId });
      if (!access.ok) return res.status(access.status || 403).json({ error: access.error });

      const driveFile = await drive.files.get({
        fileId: formId,
        fields: "id,name,appProperties",
      });
      const appProps = driveFile?.data?.appProperties || {};
      const byProps = parseAcceptingResponsesFromAppProperties(appProps);

      const current = await forms.forms.get({ formId });
      const currentTitle = String(current?.data?.info?.title || "");
      const baseTitle = stripTagsFromTitle(currentTitle) || currentTitle;
      const nextTitle = baseTitle;
      const items = Array.isArray(current?.data?.items) ? current.data.items : [];

      try {
        /** @type {Record<string, string>} */
        const questionIdToTitleObj = {};
        for (const item of items) {
          const qid = item?.questionItem?.question?.questionId;
          const title = item?.title;
          if (!qid || !title) continue;
          questionIdToTitleObj[String(qid)] = String(title);
        }
        if (Object.keys(questionIdToTitleObj).length > 0) {
          const authUser = await getAuthUserOrNull(req, res);
          await upsertFormSnapshot({
            drive,
            authUser,
            formId,
            questionIdToTitle: questionIdToTitleObj,
          });
        }
      } catch (e) {
        console.warn("failed to snapshot form items:", e?.message || String(e));
      }

      const currentName = String(driveFile?.data?.name || "");
      const baseName = stripTagsFromTitle(currentName) || currentName || baseTitle;
      const nextName = baseName;

      const currentDesc = String(current?.data?.info?.description || "");
      const host = extractHostFromFormDescription(currentDesc);

      /** @type {any[]} */
      const requests = [];
      requests.push({
        updateFormInfo: {
          info: {
            title: nextTitle,
            description: buildClosedNoticeDescription(host),
          },
          updateMask: "title,description",
        },
      });

      for (let i = items.length - 1; i >= 0; i -= 1) {
        requests.push({
          deleteItem: {
            location: { index: i },
          },
        });
      }

      requests.push({
        createItem: {
          item: {
            title: CLOSED_NOTICE_TITLE,
            description: buildClosedNoticeDescription(host),
            textItem: {},
          },
          location: { index: 0 },
        },
      });

      await forms.forms.batchUpdate({
        formId,
        requestBody: { requests },
      });

      const { mergeAppProperties } = await import("./utils.js");
      const nextProps = mergeAppProperties(appProps, {
        [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
        [APP_PROP_STATUS_KEY]: APP_PROP_STATUS_CLOSED,
      });

      await drive.files.update({
        fileId: formId,
        requestBody: {
          name: nextName || nextTitle || currentName || currentTitle,
          appProperties: nextProps,
        },
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

  app.post("/api/forms/:formId/trash", async (req, res) => {
    const { formId } = req.params;
    try {
      const savedTokens = getTokens(req);
      if (!savedTokens) {
        void logEvent({
          type: "forms_trash_rejected",
          reason: "not_logged_in",
          formId,
        });
        return res.status(401).json({ error: "Not logged in" });
      }

      void logEvent({ type: "forms_trash_requested", formId });
      const authClient = makeAuthedOAuthClientOrNull(req);
      if (!authClient) return res.status(401).json({ error: "Not logged in" });
      const drive = google.drive({ version: "v3", auth: authClient });
      const access = await enforceOwnerAccess({ req, res, drive, formId });
      if (!access.ok) return res.status(access.status || 403).json({ error: access.error });

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
}
