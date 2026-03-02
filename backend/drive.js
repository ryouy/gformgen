import {
  APP_PROP_APP_KEY,
  APP_PROP_APP_VALUE,
  APP_PROP_TYPE_KEY,
  APP_PROP_TYPE_TOOL_FOLDER,
  APP_PROP_TYPE_SETTINGS_FOLDER,
  APP_PROP_TYPE_USER_SETTINGS,
  APP_PROP_OWNER_SUB_KEY,
  APP_PROP_OWNER_EMAIL_KEY,
  APP_PROP_OWNER_NAME_KEY,
  DRIVE_TOOL_FOLDER_NAME,
  DRIVE_SETTINGS_FOLDER_NAME,
} from "./constants.js";
import { mergeAppProperties } from "./utils.js";

export async function findToolFolderOrNull({ drive, authUser }) {
  const sub = String(authUser?.sub || "").trim();
  if (!sub) return null;
  const q = [
    "trashed = false",
    "mimeType = 'application/vnd.google-apps.folder'",
    `name = '${DRIVE_TOOL_FOLDER_NAME}'`,
    `appProperties has { key='${APP_PROP_APP_KEY}' and value='${APP_PROP_APP_VALUE}' }`,
    `appProperties has { key='${APP_PROP_TYPE_KEY}' and value='${APP_PROP_TYPE_TOOL_FOLDER}' }`,
    `appProperties has { key='${APP_PROP_OWNER_SUB_KEY}' and value='${sub}' }`,
  ].join(" and ");
  const result = await drive.files.list({
    q,
    orderBy: "modifiedTime desc",
    pageSize: 5,
    fields: "files(id,name,modifiedTime,appProperties)",
  });
  const files = result?.data?.files || [];
  return files?.[0] || null;
}

export async function ensureToolFolderId({ drive, authUser }) {
  const found = await findToolFolderOrNull({ drive, authUser });
  if (found?.id) return String(found.id);
  const sub = String(authUser?.sub || "").trim();
  if (!sub) return "";
  const patch = {
    [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
    [APP_PROP_TYPE_KEY]: APP_PROP_TYPE_TOOL_FOLDER,
    [APP_PROP_OWNER_SUB_KEY]: sub,
    ...(authUser?.email ? { [APP_PROP_OWNER_EMAIL_KEY]: String(authUser.email) } : {}),
    ...(authUser?.name ? { [APP_PROP_OWNER_NAME_KEY]: String(authUser.name) } : {}),
  };
  const created = await drive.files.create({
    requestBody: {
      name: DRIVE_TOOL_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      appProperties: patch,
    },
    fields: "id",
  });
  return String(created?.data?.id || "");
}

export async function findSettingsFolderOrNull({ drive, authUser, toolFolderId }) {
  const sub = String(authUser?.sub || "").trim();
  const parentId = String(toolFolderId || "").trim();
  if (!sub || !parentId) return null;
  const q = [
    "trashed = false",
    "mimeType = 'application/vnd.google-apps.folder'",
    `'${parentId}' in parents`,
    `name = '${DRIVE_SETTINGS_FOLDER_NAME}'`,
    `appProperties has { key='${APP_PROP_APP_KEY}' and value='${APP_PROP_APP_VALUE}' }`,
    `appProperties has { key='${APP_PROP_TYPE_KEY}' and value='${APP_PROP_TYPE_SETTINGS_FOLDER}' }`,
    `appProperties has { key='${APP_PROP_OWNER_SUB_KEY}' and value='${sub}' }`,
  ].join(" and ");
  const result = await drive.files.list({
    q,
    orderBy: "modifiedTime desc",
    pageSize: 5,
    fields: "files(id,name,modifiedTime,appProperties,parents)",
  });
  const files = result?.data?.files || [];
  return files?.[0] || null;
}

export async function ensureSettingsFolderId({ drive, authUser }) {
  const toolFolderId = await ensureToolFolderId({ drive, authUser });
  if (!toolFolderId) return "";
  const found = await findSettingsFolderOrNull({ drive, authUser, toolFolderId });
  if (found?.id) return String(found.id);

  const sub = String(authUser?.sub || "").trim();
  if (!sub) return "";
  const patch = {
    [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
    [APP_PROP_TYPE_KEY]: APP_PROP_TYPE_SETTINGS_FOLDER,
    [APP_PROP_OWNER_SUB_KEY]: sub,
    ...(authUser?.email ? { [APP_PROP_OWNER_EMAIL_KEY]: String(authUser.email) } : {}),
    ...(authUser?.name ? { [APP_PROP_OWNER_NAME_KEY]: String(authUser.name) } : {}),
  };
  const created = await drive.files.create({
    requestBody: {
      name: DRIVE_SETTINGS_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      appProperties: patch,
      parents: [toolFolderId],
    },
    fields: "id",
  });
  return String(created?.data?.id || "");
}

export async function moveFileIntoFolderIfNeeded({ drive, fileId, folderId }) {
  const id = String(fileId || "").trim();
  const target = String(folderId || "").trim();
  if (!id || !target) return;
  const current = await drive.files.get({ fileId: id, fields: "id,parents" });
  const parents = Array.isArray(current?.data?.parents) ? current.data.parents : [];
  if (parents.includes(target)) return;
  const removeParents = parents.filter(Boolean).join(",");
  await drive.files.update({
    fileId: id,
    addParents: target,
    removeParents: removeParents || undefined,
    fields: "id,parents",
  });
}

export async function markDriveFileAsTrashedSafe({ drive, fileId }) {
  if (!String(fileId || "").trim()) return;
  try {
    await drive.files.update({
      fileId,
      requestBody: { trashed: true },
      fields: "id",
    });
  } catch {}
}

export async function listUserSettingsFiles({ drive, authUser }) {
  const sub = String(authUser?.sub || "").trim();
  if (!sub) return [];
  const q = [
    "trashed = false",
    `appProperties has { key='${APP_PROP_APP_KEY}' and value='${APP_PROP_APP_VALUE}' }`,
    `appProperties has { key='${APP_PROP_TYPE_KEY}' and value='${APP_PROP_TYPE_USER_SETTINGS}' }`,
    `appProperties has { key='${APP_PROP_OWNER_SUB_KEY}' and value='${sub}' }`,
  ].join(" and ");
  const result = await drive.files.list({
    q,
    orderBy: "modifiedTime desc",
    pageSize: 100,
    fields: "files(id,name,modifiedTime,appProperties,parents)",
  });
  return result?.data?.files || [];
}
