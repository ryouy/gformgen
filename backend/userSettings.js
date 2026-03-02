import {
  APP_PROP_APP_KEY,
  APP_PROP_APP_VALUE,
  APP_PROP_TYPE_KEY,
  APP_PROP_TYPE_USER_SETTINGS,
  APP_PROP_SETTINGS_KIND_KEY,
  APP_PROP_SETTINGS_BODY_VERSION_KEY,
  APP_PROP_OWNER_SUB_KEY,
  APP_PROP_OWNER_EMAIL_KEY,
  APP_PROP_OWNER_NAME_KEY,
  APP_PROP_DEFAULT_WEEKS_KEY,
  APP_PROP_DEFAULT_HOUR_KEY,
  APP_PROP_DEFAULT_MINUTE_KEY,
  APP_PROP_DEFAULT_DURATION_MINUTES_KEY,
  APP_PROP_DEFAULT_END_HOUR_KEY,
  APP_PROP_DEFAULT_END_MINUTE_KEY,
  APP_PROP_DEFAULT_DEADLINE_DAYS_BEFORE_KEY,
  APP_PROP_THEME_ACCENT_KEY,
  APP_PROP_THEME_SCOPE_KEY,
  APP_PROP_NAV_POSITION_KEY,
  APP_PROP_NAV_LABEL_MODE_KEY,
  APP_PROP_DEFAULT_PARTICIPANT_NAME_COUNT_KEY,
  APP_PROP_DEFAULT_PRICE_KEY,
  APP_PROP_DEFAULT_MEETING_TITLE_KEY,
  APP_PROP_DEFAULT_PLACE_KEY,
  APP_PROP_DEFAULT_HOST_KEY,
  SETTINGS_KIND_UNIFIED,
  SETTINGS_BODY_VERSION,
  THEME_SCOPE_SIDEBAR,
  VALID_NAV_POSITIONS,
  VALID_NAV_LABEL_MODES,
} from "./constants.js";
import { parseIntInRange, mergeAppProperties, normalizeHexColor, extractGoogleApiError } from "./utils.js";
import {
  ensureSettingsFolderId,
  listUserSettingsFiles,
  moveFileIntoFolderIfNeeded,
  markDriveFileAsTrashedSafe,
} from "./drive.js";
import { google } from "googleapis";
import {
  getTokens,
  makeAuthedOAuthClientOrNull,
  getAuthUserOrNull,
} from "./auth.js";

export function getDefaultScheduleFromProps(appProperties) {
  const props = appProperties || {};
  const weeksOffset = parseIntInRange(props?.[APP_PROP_DEFAULT_WEEKS_KEY], { min: 1, max: 6 }) ?? 6;
  const hour = parseIntInRange(props?.[APP_PROP_DEFAULT_HOUR_KEY], { min: 0, max: 23 }) ?? 15;
  const minute = parseIntInRange(props?.[APP_PROP_DEFAULT_MINUTE_KEY], { min: 0, max: 59 }) ?? 0;
  const deadlineDaysBefore =
    parseIntInRange(props?.[APP_PROP_DEFAULT_DEADLINE_DAYS_BEFORE_KEY], { min: 1, max: 14 }) ?? 2;
  const legacyDurationMinutes =
    parseIntInRange(props?.[APP_PROP_DEFAULT_DURATION_MINUTES_KEY], { min: 15, max: 480 }) ?? 60;
  let endHour = parseIntInRange(props?.[APP_PROP_DEFAULT_END_HOUR_KEY], { min: 0, max: 23 });
  let endMinute = parseIntInRange(props?.[APP_PROP_DEFAULT_END_MINUTE_KEY], { min: 0, max: 59 });
  if (endMinute != null && endMinute % 15 !== 0) endMinute = null;
  if (endHour == null || endMinute == null) {
    const totalStartMinutes = hour * 60 + minute;
    const totalEndMinutes = totalStartMinutes + legacyDurationMinutes;
    endHour = Math.floor((totalEndMinutes % (24 * 60)) / 60);
    endMinute = totalEndMinutes % 60;
  }
  return { weeksOffset, hour, minute, endHour, endMinute, deadlineDaysBefore };
}

export function getThemeFromProps(appProperties) {
  const props = appProperties || {};
  const accent = normalizeHexColor(props?.[APP_PROP_THEME_ACCENT_KEY]) || "#6b7280";
  const navPosition = VALID_NAV_POSITIONS.includes(props?.[APP_PROP_NAV_POSITION_KEY])
    ? props[APP_PROP_NAV_POSITION_KEY]
    : "sidebar";
  const navLabelMode = VALID_NAV_LABEL_MODES.includes(props?.[APP_PROP_NAV_LABEL_MODE_KEY])
    ? props[APP_PROP_NAV_LABEL_MODE_KEY]
    : "icon";
  return { accent, scope: THEME_SCOPE_SIDEBAR, navPosition, navLabelMode };
}

export function getFormDefaultsFromProps(appProperties) {
  const props = appProperties || {};
  const participantNameCount =
    parseIntInRange(props?.[APP_PROP_DEFAULT_PARTICIPANT_NAME_COUNT_KEY], { min: 1, max: 20 }) ??
    1;
  const defaultPrice = parseIntInRange(props?.[APP_PROP_DEFAULT_PRICE_KEY], { min: 0, max: 99999999 }) ?? 0;
  const defaultMeetingTitle =
    String(props?.[APP_PROP_DEFAULT_MEETING_TITLE_KEY] || "").trim() ||
    "会津産学懇話会 月定例会";
  const defaultPlace =
    String(props?.[APP_PROP_DEFAULT_PLACE_KEY] || "").trim() || "会津若松ワシントンホテル";
  const defaultHost =
    String(props?.[APP_PROP_DEFAULT_HOST_KEY] || "").trim() || "会津産学懇話会";
  return { participantNameCount, defaultPrice, defaultMeetingTitle, defaultPlace, defaultHost };
}

export function buildUnifiedSettingsFileContent(appProperties) {
  const props = appProperties || {};
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    defaultSchedule: getDefaultScheduleFromProps(props),
    theme: getThemeFromProps(props),
    formDefaults: getFormDefaultsFromProps(props),
  };
}

export function buildUserSettingsBasePatch(authUser) {
  const sub = String(authUser?.sub || "").trim();
  if (!sub) throw new Error("Missing auth user sub");
  return {
    [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
    [APP_PROP_TYPE_KEY]: APP_PROP_TYPE_USER_SETTINGS,
    [APP_PROP_SETTINGS_KIND_KEY]: SETTINGS_KIND_UNIFIED,
    [APP_PROP_SETTINGS_BODY_VERSION_KEY]: SETTINGS_BODY_VERSION,
    [APP_PROP_OWNER_SUB_KEY]: sub,
    ...(authUser?.email ? { [APP_PROP_OWNER_EMAIL_KEY]: String(authUser.email) } : {}),
    ...(authUser?.name ? { [APP_PROP_OWNER_NAME_KEY]: String(authUser.name) } : {}),
  };
}

export async function ensureUnifiedUserSettingsFile({
  drive,
  authUser,
  createIfMissing = false,
}) {
  const basePatch = buildUserSettingsBasePatch(authUser);
  const settingsFolderId = await ensureSettingsFolderId({ drive, authUser });
  const files = await listUserSettingsFiles({ drive, authUser });
  const unifiedFiles = files.filter(
    (f) => String(f?.appProperties?.[APP_PROP_SETTINGS_KIND_KEY] || "") === SETTINGS_KIND_UNIFIED
  );
  const legacyFiles = files.filter(
    (f) => String(f?.appProperties?.[APP_PROP_SETTINGS_KIND_KEY] || "") !== SETTINGS_KIND_UNIFIED
  );

  if (!createIfMissing && unifiedFiles.length === 0 && legacyFiles.length === 0) {
    return { file: null, migrated: false };
  }

  let canonical = unifiedFiles?.[0] || null;

  if (!canonical && legacyFiles.length === 0 && createIfMissing) {
    const created = await drive.files.create({
      requestBody: {
        name: "gformgen_user_settings.json",
        mimeType: "application/json",
        appProperties: basePatch,
        parents: settingsFolderId ? [settingsFolderId] : undefined,
      },
      media: {
        mimeType: "application/json",
        body: JSON.stringify(buildUnifiedSettingsFileContent(basePatch), null, 2),
      },
      fields: "id,appProperties,parents",
    });
    return {
      file: { id: created?.data?.id || "", appProperties: created?.data?.appProperties || basePatch },
      migrated: false,
    };
  }

  const needsMigration = legacyFiles.length > 0 || unifiedFiles.length > 1;
  if (!needsMigration && canonical?.id) {
    const nextProps = mergeAppProperties(canonical?.appProperties || {}, basePatch);
    const currentProps = canonical?.appProperties || {};
    const needsPatch = Object.keys(basePatch).some(
      (k) => String(currentProps?.[k] || "") !== String(nextProps?.[k] || "")
    );
    const updated = needsPatch
      ? await drive.files.update({
          fileId: canonical.id,
          requestBody: { appProperties: nextProps },
          media: {
            mimeType: "application/json",
            body: JSON.stringify(buildUnifiedSettingsFileContent(nextProps), null, 2),
          },
          fields: "id,appProperties,parents",
        })
      : null;
    if (settingsFolderId) {
      await moveFileIntoFolderIfNeeded({ drive, fileId: canonical.id, folderId: settingsFolderId });
    }
    return {
      file: {
        id: updated?.data?.id || canonical.id,
        appProperties: updated?.data?.appProperties || (needsPatch ? nextProps : currentProps),
      },
      migrated: false,
    };
  }

  const mergeTargets = [...files].sort((a, b) => {
    const ta = Date.parse(String(a?.modifiedTime || "")) || 0;
    const tb = Date.parse(String(b?.modifiedTime || "")) || 0;
    return ta - tb;
  });
  const mergedProps = mergeTargets.reduce(
    (acc, f) => mergeAppProperties(acc, f?.appProperties || {}),
    {}
  );
  const finalProps = mergeAppProperties(mergedProps, basePatch);

  if (canonical?.id) {
    const updated = await drive.files.update({
      fileId: canonical.id,
      requestBody: { appProperties: finalProps },
      media: {
        mimeType: "application/json",
        body: JSON.stringify(buildUnifiedSettingsFileContent(finalProps), null, 2),
      },
      fields: "id,appProperties",
    });
    canonical = { id: updated?.data?.id || canonical.id, appProperties: updated?.data?.appProperties || finalProps };
  } else {
    const created = await drive.files.create({
      requestBody: {
        name: "gformgen_user_settings.json",
        mimeType: "application/json",
        appProperties: finalProps,
        parents: settingsFolderId ? [settingsFolderId] : undefined,
      },
      media: {
        mimeType: "application/json",
        body: JSON.stringify(buildUnifiedSettingsFileContent(finalProps), null, 2),
      },
      fields: "id,appProperties,parents",
    });
    canonical = { id: created?.data?.id || "", appProperties: created?.data?.appProperties || finalProps };
  }

  if (settingsFolderId && canonical?.id) {
    await moveFileIntoFolderIfNeeded({ drive, fileId: canonical.id, folderId: settingsFolderId });
  }

  const staleFileIds = files
    .map((f) => String(f?.id || "").trim())
    .filter((id) => id && id !== String(canonical?.id || "").trim());
  for (const fileId of staleFileIds) {
    await markDriveFileAsTrashedSafe({ drive, fileId });
  }

  return { file: canonical, migrated: true };
}

export async function upsertUnifiedUserSettingsPatch({ drive, authUser, patch }) {
  const ensured = await ensureUnifiedUserSettingsFile({ drive, authUser, createIfMissing: true });
  if (!ensured?.file?.id) throw new Error("Failed to prepare user settings file");
  const nextProps = mergeAppProperties(ensured.file.appProperties || {}, patch || {});
  const updated = await drive.files.update({
    fileId: ensured.file.id,
    requestBody: { appProperties: nextProps },
    media: {
      mimeType: "application/json",
      body: JSON.stringify(buildUnifiedSettingsFileContent(nextProps), null, 2),
    },
    fields: "id,appProperties",
  });
  return {
    fileId: updated?.data?.id || ensured.file.id,
    appProperties: updated?.data?.appProperties || nextProps,
  };
}

export async function upsertThemeSettings({
  drive,
  authUser,
  accent,
  scope,
  navPosition = "sidebar",
  navLabelMode = "icon",
}) {
  const basePatch = buildUserSettingsBasePatch(authUser);
  const patch = {
    ...basePatch,
    [APP_PROP_THEME_ACCENT_KEY]: String(accent),
    [APP_PROP_THEME_SCOPE_KEY]: String(scope),
    [APP_PROP_NAV_POSITION_KEY]: String(navPosition),
    [APP_PROP_NAV_LABEL_MODE_KEY]: String(navLabelMode),
  };
  const result = await upsertUnifiedUserSettingsPatch({ drive, authUser, patch });
  return {
    fileId: result.fileId,
    settings: getThemeFromProps(result.appProperties),
  };
}

export async function upsertFormDefaultsSettings({
  drive,
  authUser,
  participantNameCount,
  defaultPrice,
  defaultMeetingTitle,
  defaultPlace,
  defaultHost,
}) {
  const basePatch = buildUserSettingsBasePatch(authUser);
  const patch = {
    ...basePatch,
    [APP_PROP_DEFAULT_PARTICIPANT_NAME_COUNT_KEY]: String(participantNameCount),
    [APP_PROP_DEFAULT_PRICE_KEY]: String(defaultPrice),
    [APP_PROP_DEFAULT_MEETING_TITLE_KEY]: String(defaultMeetingTitle || ""),
    [APP_PROP_DEFAULT_PLACE_KEY]: String(defaultPlace || ""),
    [APP_PROP_DEFAULT_HOST_KEY]: String(defaultHost || ""),
  };
  const result = await upsertUnifiedUserSettingsPatch({ drive, authUser, patch });
  return {
    fileId: result.fileId,
    settings: getFormDefaultsFromProps(result.appProperties),
  };
}

export async function upsertDefaultScheduleSettings({
  drive,
  authUser,
  weeksOffset,
  hour,
  minute,
  endHour,
  endMinute,
  deadlineDaysBefore,
}) {
  const basePatch = buildUserSettingsBasePatch(authUser);
  const patch = {
    ...basePatch,
    [APP_PROP_DEFAULT_WEEKS_KEY]: String(weeksOffset),
    [APP_PROP_DEFAULT_HOUR_KEY]: String(hour),
    [APP_PROP_DEFAULT_MINUTE_KEY]: String(minute),
    [APP_PROP_DEFAULT_END_HOUR_KEY]: String(endHour),
    [APP_PROP_DEFAULT_END_MINUTE_KEY]: String(endMinute),
    [APP_PROP_DEFAULT_DEADLINE_DAYS_BEFORE_KEY]: String(deadlineDaysBefore),
  };
  const result = await upsertUnifiedUserSettingsPatch({ drive, authUser, patch });
  return {
    fileId: result.fileId,
    settings: getDefaultScheduleFromProps(result.appProperties),
  };
}

export function mountUserSettingsRoutes(app) {
  app.get("/api/user-settings/default-schedule", async (req, res) => {
    try {
      const savedTokens = getTokens(req);
      if (!savedTokens) return res.status(401).json({ error: "Not logged in" });
      const authClient = makeAuthedOAuthClientOrNull(req);
      if (!authClient) return res.status(401).json({ error: "Not logged in" });
      const authUser = await getAuthUserOrNull(req, res);
      if (!authUser?.sub) return res.status(401).json({ error: "Not logged in" });

      const drive = google.drive({ version: "v3", auth: authClient });
      const { file } = await ensureUnifiedUserSettingsFile({
        drive,
        authUser,
        createIfMissing: false,
      });
      const settings = getDefaultScheduleFromProps(file?.appProperties);
      return res.json({ settings, hasSaved: Boolean(file?.id) });
    } catch (err) {
      console.error(err);
      const { status, message } = extractGoogleApiError(err);
      return res
        .status(status || 500)
        .json({ error: message || "Failed to get settings" });
    }
  });

  app.post("/api/user-settings/default-schedule", async (req, res) => {
    try {
      const savedTokens = getTokens(req);
      if (!savedTokens) return res.status(401).json({ error: "Not logged in" });
      const authClient = makeAuthedOAuthClientOrNull(req);
      if (!authClient) return res.status(401).json({ error: "Not logged in" });
      const authUser = await getAuthUserOrNull(req, res);
      if (!authUser?.sub) return res.status(401).json({ error: "Not logged in" });

      const weeksOffset =
        parseIntInRange(req?.body?.weeksOffset, { min: 1, max: 6 }) ?? null;
      const hour = parseIntInRange(req?.body?.hour, { min: 7, max: 19 }) ?? null;
      const minute = parseIntInRange(req?.body?.minute, { min: 0, max: 59 }) ?? null;
      const endHour = parseIntInRange(req?.body?.endHour, { min: 7, max: 22 }) ?? null;
      const endMinute = parseIntInRange(req?.body?.endMinute, { min: 0, max: 59 }) ?? null;
      const deadlineDaysBefore =
        parseIntInRange(req?.body?.deadlineDaysBefore, { min: 1, max: 14 }) ?? null;

      if (
        weeksOffset == null ||
        hour == null ||
        minute == null ||
        endHour == null ||
        endMinute == null ||
        deadlineDaysBefore == null ||
        minute % 15 !== 0 ||
        endMinute % 15 !== 0
      ) {
        return res.status(400).json({ error: "Invalid settings payload" });
      }

      const drive = google.drive({ version: "v3", auth: authClient });
      const result = await upsertDefaultScheduleSettings({
        drive,
        authUser,
        weeksOffset,
        hour,
        minute,
        endHour,
        endMinute,
        deadlineDaysBefore,
      });
      return res.json({ ok: true, settings: result.settings });
    } catch (err) {
      console.error(err);
      const { status, message } = extractGoogleApiError(err);
      return res
        .status(status || 500)
        .json({ error: message || "Failed to save settings" });
    }
  });

  app.get("/api/user-settings/theme", async (req, res) => {
    try {
      const savedTokens = getTokens(req);
      if (!savedTokens) return res.status(401).json({ error: "Not logged in" });
      const authClient = makeAuthedOAuthClientOrNull(req);
      if (!authClient) return res.status(401).json({ error: "Not logged in" });
      const authUser = await getAuthUserOrNull(req, res);
      if (!authUser?.sub) return res.status(401).json({ error: "Not logged in" });

      const drive = google.drive({ version: "v3", auth: authClient });
      const { file } = await ensureUnifiedUserSettingsFile({
        drive,
        authUser,
        createIfMissing: false,
      });
      const settings = getThemeFromProps(file?.appProperties);
      return res.json({ settings, hasSaved: Boolean(file?.id) });
    } catch (err) {
      console.error(err);
      const { status, message } = extractGoogleApiError(err);
      return res.status(status || 500).json({ error: message || "Failed to get theme" });
    }
  });

  app.post("/api/user-settings/theme", async (req, res) => {
    try {
      const savedTokens = getTokens(req);
      if (!savedTokens) return res.status(401).json({ error: "Not logged in" });
      const authClient = makeAuthedOAuthClientOrNull(req);
      if (!authClient) return res.status(401).json({ error: "Not logged in" });
      const authUser = await getAuthUserOrNull(req, res);
      if (!authUser?.sub) return res.status(401).json({ error: "Not logged in" });

      const accent = normalizeHexColor(req?.body?.accent) || "";
      const scope = THEME_SCOPE_SIDEBAR;
      if (!accent) return res.status(400).json({ error: "Invalid accent color" });

      const navPosition = VALID_NAV_POSITIONS.includes(req?.body?.navPosition)
        ? req.body.navPosition
        : "sidebar";
      const navLabelMode = VALID_NAV_LABEL_MODES.includes(req?.body?.navLabelMode)
        ? req.body.navLabelMode
        : "icon";

      const drive = google.drive({ version: "v3", auth: authClient });
      const result = await upsertThemeSettings({
        drive,
        authUser,
        accent,
        scope,
        navPosition,
        navLabelMode,
      });
      return res.json({ ok: true, settings: result.settings });
    } catch (err) {
      console.error(err);
      const { status, message } = extractGoogleApiError(err);
      return res.status(status || 500).json({ error: message || "Failed to save theme" });
    }
  });

  app.get("/api/user-settings/form-defaults", async (req, res) => {
    try {
      const savedTokens = getTokens(req);
      if (!savedTokens) return res.status(401).json({ error: "Not logged in" });
      const authClient = makeAuthedOAuthClientOrNull(req);
      if (!authClient) return res.status(401).json({ error: "Not logged in" });
      const authUser = await getAuthUserOrNull(req, res);
      if (!authUser?.sub) return res.status(401).json({ error: "Not logged in" });

      const drive = google.drive({ version: "v3", auth: authClient });
      const { file } = await ensureUnifiedUserSettingsFile({
        drive,
        authUser,
        createIfMissing: false,
      });
      const settings = getFormDefaultsFromProps(file?.appProperties);
      return res.json({ settings, hasSaved: Boolean(file?.id) });
    } catch (err) {
      console.error(err);
      const { status, message } = extractGoogleApiError(err);
      return res
        .status(status || 500)
        .json({ error: message || "Failed to get form defaults" });
    }
  });

  app.post("/api/user-settings/form-defaults", async (req, res) => {
    try {
      const savedTokens = getTokens(req);
      if (!savedTokens) return res.status(401).json({ error: "Not logged in" });
      const authClient = makeAuthedOAuthClientOrNull(req);
      if (!authClient) return res.status(401).json({ error: "Not logged in" });
      const authUser = await getAuthUserOrNull(req, res);
      if (!authUser?.sub) return res.status(401).json({ error: "Not logged in" });

      const participantNameCount =
        parseIntInRange(req?.body?.participantNameCount, { min: 1, max: 20 }) ?? null;
      const parsedDefaultPrice = parseIntInRange(req?.body?.defaultPrice, { min: 0, max: 99999999 });
      const defaultPrice = parsedDefaultPrice == null ? 0 : parsedDefaultPrice;
      const defaultMeetingTitle = String(req?.body?.defaultMeetingTitle || "").trim();
      const defaultPlace = String(req?.body?.defaultPlace || "").trim();
      const defaultHost = String(req?.body?.defaultHost || "").trim();
      if (participantNameCount == null) {
        return res.status(400).json({ error: "Invalid settings payload" });
      }
      if (defaultMeetingTitle.length > 120 || defaultPlace.length > 120 || defaultHost.length > 120) {
        return res.status(400).json({ error: "Invalid settings payload" });
      }

      const drive = google.drive({ version: "v3", auth: authClient });
      const result = await upsertFormDefaultsSettings({
        drive,
        authUser,
        participantNameCount,
        defaultPrice,
        defaultMeetingTitle,
        defaultPlace,
        defaultHost,
      });
      return res.json({ ok: true, settings: result.settings });
    } catch (err) {
      console.error(err);
      const { status, message } = extractGoogleApiError(err);
      return res
        .status(status || 500)
        .json({ error: message || "Failed to save form defaults" });
    }
  });

  app.post("/api/user-settings/all", async (req, res) => {
    try {
      const savedTokens = getTokens(req);
      if (!savedTokens) return res.status(401).json({ error: "Not logged in" });
      const authClient = makeAuthedOAuthClientOrNull(req);
      if (!authClient) return res.status(401).json({ error: "Not logged in" });
      const authUser = await getAuthUserOrNull(req, res);
      if (!authUser?.sub) return res.status(401).json({ error: "Not logged in" });

      const body = req?.body || {};
      const schedule = body.defaultSchedule || {};
      const formDefaults = body.formDefaults || {};
      const theme = body.theme || {};

      const weeksOffset =
        parseIntInRange(schedule.weeksOffset, { min: 1, max: 6 }) ?? 6;
      const hour = parseIntInRange(schedule.hour, { min: 7, max: 19 }) ?? 15;
      let minute = parseIntInRange(schedule.minute, { min: 0, max: 59 }) ?? 0;
      const endHour = parseIntInRange(schedule.endHour, { min: 7, max: 22 }) ?? 16;
      let endMinute = parseIntInRange(schedule.endMinute, { min: 0, max: 59 }) ?? 0;
      if (minute % 15 !== 0) minute = Math.round(minute / 15) * 15;
      if (endMinute % 15 !== 0) endMinute = Math.round(endMinute / 15) * 15;
      const deadlineDaysBefore =
        parseIntInRange(schedule.deadlineDaysBefore, { min: 1, max: 14 }) ?? 2;

      const participantNameCount =
        parseIntInRange(formDefaults.participantNameCount, { min: 1, max: 20 }) ?? 1;
      const defaultPrice =
        parseIntInRange(formDefaults.defaultPrice, { min: 0, max: 99999999 }) ?? 0;
      const defaultMeetingTitle =
        String(formDefaults.defaultMeetingTitle || "").trim().slice(0, 120) ||
        "会津産学懇話会 月定例会";
      const defaultPlace =
        String(formDefaults.defaultPlace || "").trim().slice(0, 120) ||
        "会津若松ワシントンホテル";
      const defaultHost =
        String(formDefaults.defaultHost || "").trim().slice(0, 120) ||
        "会津産学懇話会";

      const accent =
        normalizeHexColor(theme.accent) ||
        normalizeHexColor(process.env.GF_THEME_ACCENT) ||
        "#6b7280";
      const navPosition = VALID_NAV_POSITIONS.includes(theme.navPosition)
        ? theme.navPosition
        : "sidebar";
      const navLabelMode = VALID_NAV_LABEL_MODES.includes(theme.navLabelMode)
        ? theme.navLabelMode
        : "icon";

      const basePatch = buildUserSettingsBasePatch(authUser);
      const patch = {
        ...basePatch,
        [APP_PROP_DEFAULT_WEEKS_KEY]: String(weeksOffset),
        [APP_PROP_DEFAULT_HOUR_KEY]: String(hour),
        [APP_PROP_DEFAULT_MINUTE_KEY]: String(minute),
        [APP_PROP_DEFAULT_END_HOUR_KEY]: String(endHour),
        [APP_PROP_DEFAULT_END_MINUTE_KEY]: String(endMinute),
        [APP_PROP_DEFAULT_DEADLINE_DAYS_BEFORE_KEY]: String(deadlineDaysBefore),
        [APP_PROP_DEFAULT_PARTICIPANT_NAME_COUNT_KEY]: String(participantNameCount),
        [APP_PROP_DEFAULT_PRICE_KEY]: String(defaultPrice),
        [APP_PROP_DEFAULT_MEETING_TITLE_KEY]: defaultMeetingTitle,
        [APP_PROP_DEFAULT_PLACE_KEY]: defaultPlace,
        [APP_PROP_DEFAULT_HOST_KEY]: defaultHost,
        [APP_PROP_THEME_ACCENT_KEY]: accent,
        [APP_PROP_THEME_SCOPE_KEY]: THEME_SCOPE_SIDEBAR,
        [APP_PROP_NAV_POSITION_KEY]: navPosition,
        [APP_PROP_NAV_LABEL_MODE_KEY]: navLabelMode,
      };

      const drive = google.drive({ version: "v3", auth: authClient });
      const result = await upsertUnifiedUserSettingsPatch({ drive, authUser, patch });

      return res.json({
        ok: true,
        settings: {
          defaultSchedule: getDefaultScheduleFromProps(result.appProperties),
          formDefaults: getFormDefaultsFromProps(result.appProperties),
          theme: getThemeFromProps(result.appProperties),
        },
      });
    } catch (err) {
      console.error(err);
      const { status, message } = extractGoogleApiError(err);
      return res
        .status(status || 500)
        .json({ error: message || "Failed to save settings" });
    }
  });
}
