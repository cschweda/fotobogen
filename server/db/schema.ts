// The complete v1 data model (DESIGN.md section 4). Tables that later phases
// use are defined now so the first migration is the whole schema.
//
// Conventions: ids are 12-character random strings; timestamps are integer
// milliseconds since the epoch; booleans are 0 or 1.
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'),
  // Copied into the session at login; bumping it signs out every session.
  sessionVersion: integer('session_version').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  lastLoginAt: integer('last_login_at'),
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
})

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title'),
  description: text('description'),
  alt: text('alt'),
  originalPath: text('original_path').notNull(),
  originalFilename: text('original_filename').notNull(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  checksum: text('checksum').notNull(), // SHA-256, for duplicate detection
  width: integer('width'), // post-rotation pixels
  height: integer('height'),
  thumbhash: text('thumbhash'), // base64
  takenAt: integer('taken_at'),
  camera: text('camera'),
  lens: text('lens'),
  focalLength: text('focal_length'),
  aperture: text('aperture'),
  shutter: text('shutter'),
  iso: integer('iso'),
  // Stored privately; never output unless privacy.show_location is on.
  lat: real('lat'),
  lng: real('lng'),
  exifJson: text('exif_json', { mode: 'json' }),
  recipeJson: text('recipe_json', { mode: 'json' }),
  status: text('status', { enum: ['processing', 'ready', 'failed'] }).notNull().default('processing'),
  visibility: text('visibility', { enum: ['public', 'hidden'] }).notNull().default('public'),
  // When a public photo goes live. Null means at once; a time in the future
  // keeps it off the site until then.
  publishAt: integer('publish_at'),
  // The licence visitors are told the photo is under; null follows the site's.
  license: text('license'),
  // Whether visitors may download it; null follows the site's setting.
  allowDownload: integer('allow_download', { mode: 'boolean' }),
  isSample: integer('is_sample', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [
  uniqueIndex('photos_checksum_unique').on(table.checksum),
  index('photos_listing_idx').on(table.visibility, table.status, table.sortOrder),
])

export const derivatives = sqliteTable('derivatives', {
  id: text('id').primaryKey(),
  photoId: text('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['thumb', 'square', 'medium', 'large'] }).notNull(),
  format: text('format').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  path: text('path').notNull(),
  bytes: integer('bytes').notNull(),
}, table => [
  uniqueIndex('derivatives_photo_kind_format_unique').on(table.photoId, table.kind, table.format),
])

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['ingest', 'rerender'] }).notNull(),
  photoId: text('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['queued', 'running', 'done', 'failed'] }).notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at'),
}, table => [
  index('jobs_status_idx').on(table.status, table.createdAt),
])

// Albums: named sets of photos, in an order of their own. A photo can be in
// several albums, or none.
export const albums = sqliteTable('albums', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  // The photo shown for the album in lists; the first photo when not set.
  coverPhotoId: text('cover_photo_id').references(() => photos.id, { onDelete: 'set null' }),
  visibility: text('visibility', { enum: ['public', 'hidden'] }).notNull().default('public'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const albumPhotos = sqliteTable('album_photos', {
  albumId: text('album_id').notNull().references(() => albums.id, { onDelete: 'cascade' }),
  photoId: text('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
}, table => [
  primaryKey({ columns: [table.albumId, table.photoId] }),
  index('album_photos_photo_idx').on(table.photoId),
])

// Tags: short labels on photos. A tag exists only while a photo has it.
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
})

export const photoTags = sqliteTable('photo_tags', {
  photoId: text('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, table => [
  primaryKey({ columns: [table.photoId, table.tagId] }),
  index('photo_tags_tag_idx').on(table.tagId),
])

export const modules = sqliteTable('modules', {
  name: text('name').primaryKey(),
  version: text('version').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
})
