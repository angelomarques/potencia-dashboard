import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const apps = sqliteTable("apps", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "number" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "number" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "number" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "number" }).notNull(),
  createdAt: integer("created_at", { mode: "number" }),
  updatedAt: integer("updated_at", { mode: "number" }),
});

export const boards = sqliteTable(
  "boards",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [index("idx_boards_app").on(t.appId)],
);

export const columns = sqliteTable(
  "columns",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    color: text("color"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (t) => [index("idx_columns_board").on(t.boardId)],
);

export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    columnId: text("column_id")
      .notNull()
      .references(() => columns.id, { onDelete: "cascade" }),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    position: integer("position").notNull().default(0),
    priority: text("priority").default("medium"),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    dueDate: integer("due_date", { mode: "number" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    index("idx_cards_column").on(t.columnId),
    index("idx_cards_board").on(t.boardId),
  ],
);

export type App = typeof apps.$inferSelect;
export type Board = typeof boards.$inferSelect;
export type Column = typeof columns.$inferSelect;
export type Card = typeof cards.$inferSelect;


export const youtubeChannels = sqliteTable("youtube_channels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  handle: text("handle"),
  youtubeChannelId: text("youtube_channel_id"),
  refreshTokenEnc: text("refresh_token_enc"),
  accessTokenEnc: text("access_token_enc"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "number" }),
  oauthScopes: text("oauth_scopes"),
  tokenStatus: text("token_status").notNull().default("missing"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export const youtubeVideos = sqliteTable(
  "youtube_videos",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => youtubeChannels.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    tagsJson: text("tags_json"),
    categoryId: text("category_id").default("22"),
    privacyStatus: text("privacy_status").notNull().default("private"),
    madeForKids: integer("made_for_kids", { mode: "boolean" }).notNull().default(false),
    r2Bucket: text("r2_bucket"),
    r2Key: text("r2_key"),
    r2SizeBytes: integer("r2_size_bytes", { mode: "number" }),
    sourcePath: text("source_path"),
    episode: text("episode"),
    status: text("status").notNull().default("pending"),
    youtubeVideoId: text("youtube_video_id"),
    publishError: text("publish_error"),
    metadataJson: text("metadata_json"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
    publishedAt: integer("published_at", { mode: "number" }),
  },
  (t) => [
    index("idx_yt_videos_channel").on(t.channelId),
    index("idx_yt_videos_status").on(t.status),
  ],
);

export const youtubeUploadJobs = sqliteTable(
  "youtube_upload_jobs",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => youtubeVideos.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    attempt: integer("attempt").notNull().default(0),
    dryRun: integer("dry_run", { mode: "boolean" }).notNull().default(false),
    requestJson: text("request_json"),
    resultJson: text("result_json"),
    error: text("error"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
    finishedAt: integer("finished_at", { mode: "number" }),
  },
  (t) => [index("idx_yt_jobs_video").on(t.videoId)],
);

export type YoutubeChannel = typeof youtubeChannels.$inferSelect;
export type YoutubeVideo = typeof youtubeVideos.$inferSelect;
export type YoutubeUploadJob = typeof youtubeUploadJobs.$inferSelect;
