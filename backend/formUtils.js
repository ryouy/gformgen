import {
  APP_PROP_APP_KEY,
  APP_PROP_APP_VALUE,
  APP_PROP_OWNER_SUB_KEY,
  APP_PROP_STATUS_KEY,
  APP_PROP_STATUS_CLOSED,
  APP_PROP_TYPE_KEY,
  APP_PROP_TYPE_FORM_SNAPSHOT,
  APP_PROP_FORM_ID_KEY,
  APP_PROP_OWNER_EMAIL_KEY,
  APP_PROP_OWNER_NAME_KEY,
  FORM_NAME_TAG,
  FORM_CLOSED_TAG,
  FORM_SNAPSHOT_SCHEMA_VERSION,
} from "./constants.js";
import { mergeAppProperties, buildOwnerAppPropertiesPatch } from "./utils.js";
import {
  findFormSnapshotFileOrNull,
  readDriveJsonFileOrNull,
  ensureSettingsFolderId,
  moveFileIntoFolderIfNeeded,
} from "./drive.js";

export const formatDateJP = (isoString, withTime = false) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (!Number.isFinite(d.getTime())) return "";

  const dateParts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(d);

  const map = {};
  for (const p of dateParts) {
    if (p?.type && p.type !== "literal") map[p.type] = p.value;
  }
  const y = map.year || "";
  const m = map.month || "";
  const day = map.day || "";
  const w = map.weekday || "";

  if (withTime) {
    const timeParts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const t = {};
    for (const p of timeParts) {
      if (p?.type && p.type !== "literal") t[p.type] = p.value;
    }
    const hh = String(t.hour || "").padStart(2, "0");
    const mm = String(t.minute || "").padStart(2, "0");
    return `${y}年${m}月${day}日（${w}）${hh}:${mm}`;
  }

  return `${y}年${m}月${day}日（${w}）`;
};

export const formatTimeJP = (isoString) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (!Number.isFinite(d.getTime())) return "";
  const timeParts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const t = {};
  for (const p of timeParts) {
    if (p?.type && p.type !== "literal") t[p.type] = p.value;
  }
  const hh = String(t.hour || "").padStart(2, "0");
  const mm = String(t.minute || "").padStart(2, "0");
  return `${hh}:${mm}`;
};

export const formatDateTimeRangeJP = (startIso, endIso) => {
  const start = String(startIso || "").trim();
  const end = String(endIso || "").trim();
  if (!start) return "";
  if (!end) return formatDateJP(start, true);

  const startDate = formatDateJP(start, false);
  const endDate = formatDateJP(end, false);
  const startTime = formatTimeJP(start);
  const endTime = formatTimeJP(end);
  if (!startDate || !startTime || !endDate || !endTime) return formatDateJP(start, true);
  if (startDate === endDate) return `${startDate}${startTime}〜${endTime}`;
  return `${formatDateJP(start, true)}〜${formatDateJP(end, true)}`;
};

export async function listAllFormResponses(forms, formId) {
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

export async function buildQuestionIdToTitleMap(forms, formId) {
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

export function getAnswerValue(answer) {
  return (
    answer?.textAnswers?.answers?.[0]?.value ??
    answer?.textAnswer?.value ??
    ""
  );
}

export function isParticipantNameTitle(title) {
  const t = String(title || "");
  return (
    t.includes("参加者名（") ||
    t.includes("氏名（") ||
    t.includes("氏名(") ||
    t === "氏名"
  );
}

export function isParticipantRoleTitle(title) {
  const t = String(title || "");
  return t.includes("役職名（") || t.includes("役職名(") || t === "役職名";
}

export function parseIndexedFieldNumber(title) {
  const t = String(title || "");
  const m0 = t.match(/（\s*(\d+)\s*人目\s*）/);
  if (m0?.[1]) return Number(m0[1]);
  const m1 = t.match(/（\s*(\d+)\s*）/);
  if (m1?.[1]) return Number(m1[1]);
  const m2 = t.match(/\(\s*(\d+)\s*人目\s*\)/);
  if (m2?.[1]) return Number(m2[1]);
  const m3 = t.match(/\(\s*(\d+)\s*\)/);
  if (m3?.[1]) return Number(m3[1]);
  return null;
}

export function parseAcceptingResponsesFromTitle(title) {
  const t = String(title || "");
  if (t.includes(FORM_CLOSED_TAG)) return false;
  if (t.includes(FORM_NAME_TAG)) return true;
  return null;
}

export function parseAcceptingResponsesFromAppProperties(appProperties) {
  const props = appProperties || {};
  const app = props?.[APP_PROP_APP_KEY];
  const status = props?.[APP_PROP_STATUS_KEY];
  if (String(app || "") !== APP_PROP_APP_VALUE) return null;
  if (String(status || "") === APP_PROP_STATUS_CLOSED) return false;
  return true;
}

export function stripTagsFromTitle(title) {
  return String(title || "")
    .replace(`${FORM_NAME_TAG} `, "")
    .replace(`${FORM_CLOSED_TAG} `, "")
    .replace(FORM_NAME_TAG, "")
    .replace(FORM_CLOSED_TAG, "")
    .trim();
}

export async function buildQuestionIdToTitleMapWithSnapshot({ forms, drive, formId }) {
  try {
    const map = await buildQuestionIdToTitleMap(forms, formId);
    if (map && map.size > 0) return map;
  } catch {
    // fallthrough
  }

  try {
    const snapFile = await findFormSnapshotFileOrNull({ drive, formId });
    if (!snapFile?.id) return new Map();
    const json = await readDriveJsonFileOrNull(drive, snapFile.id);
    const obj = json?.questionIdToTitle;
    if (!obj || typeof obj !== "object") return new Map();
    return new Map(Object.entries(obj).map(([k, v]) => [String(k), String(v)]));
  } catch {
    return new Map();
  }
}

export async function migrateFileToAppProperties({ forms, drive, file, authUser }) {
  const formId = file?.id;
  if (!formId) return { migrated: false };
  const ownedByMe = file?.ownedByMe === true;

  const currentName = String(file?.name || "");
  const cleanedName = stripTagsFromTitle(currentName) || currentName;
  const currentProps = file?.appProperties || {};

  const acceptingFromTitle = parseAcceptingResponsesFromTitle(currentName);
  const inferredStatus =
    acceptingFromTitle === false ? APP_PROP_STATUS_CLOSED : undefined;

  const nextProps = mergeAppProperties(
    currentProps,
    mergeAppProperties(
      {
        [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
        ...(inferredStatus ? { [APP_PROP_STATUS_KEY]: inferredStatus } : {}),
      },
      buildOwnerAppPropertiesPatch(currentProps, authUser, ownedByMe)
    )
  );

  const needsDriveUpdate =
    String(currentProps?.[APP_PROP_APP_KEY] || "") !== APP_PROP_APP_VALUE ||
    currentName.includes(FORM_NAME_TAG) ||
    currentName.includes(FORM_CLOSED_TAG) ||
    (ownedByMe &&
      String(currentProps?.[APP_PROP_OWNER_SUB_KEY] || "").trim() !==
        String(nextProps?.[APP_PROP_OWNER_SUB_KEY] || "").trim());

  let cleanedTitle = "";
  let needsFormsUpdate = false;
  try {
    const currentForm = await forms.forms.get({ formId });
    const currentTitle = String(currentForm?.data?.info?.title || "");
    cleanedTitle = stripTagsFromTitle(currentTitle) || currentTitle;
    needsFormsUpdate =
      currentTitle.includes(FORM_NAME_TAG) ||
      currentTitle.includes(FORM_CLOSED_TAG);

    if (needsFormsUpdate && cleanedTitle && cleanedTitle !== currentTitle) {
      await forms.forms.batchUpdate({
        formId,
        requestBody: {
          requests: [
            {
              updateFormInfo: {
                info: { title: cleanedTitle },
                updateMask: "title",
              },
            },
          ],
        },
      });
    }
  } catch (e) {
    console.warn("forms title migration failed:", e?.message || String(e));
  }

  if (needsDriveUpdate) {
    try {
      await drive.files.update({
        fileId: formId,
        requestBody: {
          name: cleanedName || cleanedTitle || currentName,
          appProperties: nextProps,
        },
      });
    } catch (e) {
      console.warn("drive migration failed:", e?.message || String(e));
      return { migrated: false };
    }
  }

  return {
    migrated: Boolean(needsDriveUpdate || needsFormsUpdate),
    cleanedName: cleanedName || cleanedTitle || currentName,
    nextProps,
  };
}

export async function upsertFormSnapshot({ drive, authUser, formId, questionIdToTitle }) {
  const id = String(formId || "").trim();
  if (!id) return { ok: false };
  const settingsFolderId = await ensureSettingsFolderId({ drive, authUser });
  const existing = await findFormSnapshotFileOrNull({ drive, formId: id });
  const payload = {
    schemaVersion: FORM_SNAPSHOT_SCHEMA_VERSION,
    formId: id,
    createdAt: new Date().toISOString(),
    questionIdToTitle,
  };
  const patch = {
    [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
    [APP_PROP_TYPE_KEY]: APP_PROP_TYPE_FORM_SNAPSHOT,
    [APP_PROP_FORM_ID_KEY]: id,
    ...(authUser?.sub ? { [APP_PROP_OWNER_SUB_KEY]: String(authUser.sub) } : {}),
    ...(authUser?.email ? { [APP_PROP_OWNER_EMAIL_KEY]: String(authUser.email) } : {}),
    ...(authUser?.name ? { [APP_PROP_OWNER_NAME_KEY]: String(authUser.name) } : {}),
  };

  if (!existing?.id) {
    const created = await drive.files.create({
      requestBody: {
        name: `gformgen_form_snapshot_${id}.json`,
        mimeType: "application/json",
        appProperties: patch,
        parents: settingsFolderId ? [settingsFolderId] : undefined,
      },
      media: {
        mimeType: "application/json",
        body: JSON.stringify(payload, null, 2),
      },
      fields: "id",
    });
    return { ok: Boolean(created?.data?.id), fileId: created?.data?.id || "" };
  }

  const nextProps = mergeAppProperties(existing?.appProperties || {}, patch);
  await drive.files.update({
    fileId: existing.id,
    requestBody: {
      appProperties: nextProps,
    },
    media: {
      mimeType: "application/json",
      body: JSON.stringify(payload, null, 2),
    },
    fields: "id",
  });
  if (settingsFolderId && existing?.id) {
    await moveFileIntoFolderIfNeeded({ drive, fileId: existing.id, folderId: settingsFolderId });
  }
  return { ok: true, fileId: existing.id };
}
