export const FORM_NAME_TAG = "[gformgen:sangaku]";
export const FORM_CLOSED_TAG = "[gformgen:closed]";
export const APP_PROP_APP_KEY = "gformgen_app";
export const APP_PROP_STATUS_KEY = "gformgen_status";
export const APP_PROP_APP_VALUE = "sangaku";
export const APP_PROP_STATUS_CLOSED = "closed";
export const APP_PROP_OWNER_SUB_KEY = "gformgen_owner_sub";
export const APP_PROP_OWNER_EMAIL_KEY = "gformgen_owner_email";
export const APP_PROP_OWNER_NAME_KEY = "gformgen_owner_name";
export const APP_PROP_SHORT_CODE_KEY = "gformgen_short_code";
export const CLOSED_NOTICE_TITLE = "【回答受付終了】このフォームは締め切られています。";

export const APP_PROP_TYPE_FORM_SNAPSHOT = "form_snapshot";
export const APP_PROP_FORM_ID_KEY = "gformgen_form_id";
export const FORM_SNAPSHOT_SCHEMA_VERSION = 1;

export const APP_PROP_TYPE_KEY = "gformgen_type";
export const APP_PROP_TYPE_USER_SETTINGS = "user_settings";
export const APP_PROP_TYPE_TOOL_FOLDER = "tool_folder";
export const APP_PROP_TYPE_SETTINGS_FOLDER = "settings_folder";
export const APP_PROP_SETTINGS_KIND_KEY = "gformgen_settings_kind";
export const APP_PROP_SETTINGS_BODY_VERSION_KEY = "gformgen_settings_body_version";
export const SETTINGS_KIND_UNIFIED = "all";
export const SETTINGS_BODY_VERSION = "1";
export const DRIVE_TOOL_FOLDER_NAME = "フォーム管理ツール";
export const DRIVE_SETTINGS_FOLDER_NAME = "設定ファイル";

export const APP_PROP_DEFAULT_WEEKS_KEY = "gformgen_default_weeks";
export const APP_PROP_DEFAULT_HOUR_KEY = "gformgen_default_hour";
export const APP_PROP_DEFAULT_MINUTE_KEY = "gformgen_default_minute";
export const APP_PROP_DEFAULT_DURATION_MINUTES_KEY = "gformgen_default_duration_minutes";
export const APP_PROP_DEFAULT_END_HOUR_KEY = "gformgen_default_end_hour";
export const APP_PROP_DEFAULT_END_MINUTE_KEY = "gformgen_default_end_minute";
export const APP_PROP_DEFAULT_DEADLINE_DAYS_BEFORE_KEY = "gformgen_default_deadline_days_before";
export const APP_PROP_THEME_ACCENT_KEY = "gformgen_theme_accent";
export const APP_PROP_THEME_SCOPE_KEY = "gformgen_theme_scope";
export const APP_PROP_NAV_POSITION_KEY = "gformgen_nav_position";
export const APP_PROP_NAV_LABEL_MODE_KEY = "gformgen_nav_label_mode";
export const APP_PROP_DEFAULT_PARTICIPANT_NAME_COUNT_KEY = "gformgen_default_participant_name_count";
export const APP_PROP_DEFAULT_PRICE_KEY = "gformgen_default_price";
export const APP_PROP_DEFAULT_MEETING_TITLE_KEY = "gformgen_default_meeting_title";
export const APP_PROP_DEFAULT_PLACE_KEY = "gformgen_default_place";
export const APP_PROP_DEFAULT_HOST_KEY = "gformgen_default_host";

export const THEME_SCOPE_ACCENT = "accent";
export const THEME_SCOPE_SIDEBAR = "sidebar";

export const VALID_NAV_POSITIONS = ["sidebar", "bottom-left", "top-left"];
export const VALID_NAV_LABEL_MODES = ["icon", "text", "both"];

export function buildClosedNoticeDescription(host) {
  const hostLabel = String(host || "").trim() || "主催者";
  return [
    "このフォームの回答受付は終了しました。",
    "新しい回答は送信できません。",
    "",
    `ご不明な点は${hostLabel}事務局へお問い合わせください。`,
    "（TEL）0242-23-8511",
  ].join("\n");
}

export function extractHostFromFormDescription(description) {
  const s = String(description || "").trim();
  const m = s.match(/【お問合せ先】\s*\n\s*(.+?)\s*事務局/);
  return m ? m[1].trim() : "";
}
