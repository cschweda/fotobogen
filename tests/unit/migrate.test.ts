import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyMigrations, readMigrationsFromDir } from '../../server/core/migrate.ts'

const migrationsDir = fileURLToPath(new URL('../../server/db/migrations', import.meta.url))
const tableNames = (db: Database.Database) =>
  (db.prepare(`select name from sqlite_master where type = 'table'`).all() as { name: string }[]).map(row => row.name)

// A version always carries its earlier migrations; this one is already applied, so it is not run again.
const APPLIED = { name: '0001_tables', sql: '' }

describe('applyMigrations', () => {
  it('creates every table in the design on an empty database', () => {
    const db = new Database(':memory:')
    const applied = applyMigrations(db, readMigrationsFromDir(migrationsDir))
    expect(applied.length).toBeGreaterThan(0)
    expect(tableNames(db)).toEqual(expect.arrayContaining(['users', 'settings', 'photos', 'derivatives', 'jobs', 'modules']))
    const userColumns = (db.prepare(`pragma table_info(users)`).all() as { name: string }[]).map(c => c.name)
    expect(userColumns).toEqual(['id', 'username', 'password_hash', 'role', 'session_version', 'created_at', 'last_login_at'])
  })

  it('applies nothing the second time', () => {
    const db = new Database(':memory:')
    const migrations = readMigrationsFromDir(migrationsDir)
    applyMigrations(db, migrations)
    expect(applyMigrations(db, migrations)).toEqual([])
  })

  it('rolls a failing migration back completely and reports its name', () => {
    const db = new Database(':memory:')
    const bad = [{ name: '0001_bad', sql: 'create table a (id text);\n--> statement-breakpoint\ncreate table a (id text);' }]
    expect(() => applyMigrations(db, bad)).toThrow(/0001_bad/)
    expect(tableNames(db)).not.toContain('a')
  })

  it('refuses a database that a newer version of Fotobogen has changed, and leaves it alone', () => {
    const db = new Database(':memory:')
    const migrations = readMigrationsFromDir(migrationsDir)
    applyMigrations(db, migrations)
    db.prepare(`insert into __migrations (name, applied_at) values ('9999_from_the_future', 1)`).run()
    expect(() => applyMigrations(db, migrations)).toThrow(/newer version of Fotobogen/)
    expect(() => applyMigrations(db, migrations)).toThrow(/9999_from_the_future/)
  })

  it('applies migrations in name order', () => {
    const db = new Database(':memory:')
    const applied = applyMigrations(db, [
      { name: '0002_b', sql: 'alter table t add column b text;' },
      { name: '0001_a', sql: 'create table t (a text);' },
    ])
    expect(applied).toEqual(['0001_a', '0002_b'])
  })

  it('deleting a photo removes its derivatives and jobs', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    applyMigrations(db, readMigrationsFromDir(migrationsDir))
    db.prepare(`insert into photos (id, slug, original_path, original_filename, mime, bytes, checksum, created_at, updated_at)
      values ('p1', 'one', 'p1.jpg', 'one.jpg', 'image/jpeg', 1, 'abc', 1, 1)`).run()
    db.prepare(`insert into derivatives (id, photo_id, kind, format, width, height, path, bytes) values ('d1', 'p1', 'thumb', 'webp', 1, 1, 'x', 1)`).run()
    db.prepare(`insert into jobs (id, type, photo_id, created_at) values ('j1', 'ingest', 'p1', 1)`).run()
    db.prepare(`delete from photos where id = 'p1'`).run()
    expect(db.prepare(`select count(*) as n from derivatives`).get()).toEqual({ n: 0 })
    expect(db.prepare(`select count(*) as n from jobs`).get()).toEqual({ n: 0 })
  })

  it('keeps child rows when a migration rebuilds the table they point to', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    applyMigrations(db, [{
      name: '0001_tables',
      sql: `create table parent (id text primary key);
--> statement-breakpoint
create table child (id text primary key, parent_id text not null references parent(id) on delete cascade);
--> statement-breakpoint
insert into parent values ('p');
--> statement-breakpoint
insert into child values ('c', 'p');`,
    }])
    // The shape drizzle-kit generates for a column change in SQLite.
    applyMigrations(db, [APPLIED, {
      name: '0002_rebuild_parent',
      sql: `PRAGMA foreign_keys=OFF;
--> statement-breakpoint
create table __new_parent (id text primary key, note text);
--> statement-breakpoint
insert into __new_parent (id) select id from parent;
--> statement-breakpoint
drop table parent;
--> statement-breakpoint
alter table __new_parent rename to parent;
--> statement-breakpoint
PRAGMA foreign_keys=ON;`,
    }])
    expect(db.prepare('select count(*) as n from child').get()).toEqual({ n: 1 })
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('refuses a migration that would leave rows pointing at nothing', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    applyMigrations(db, [{
      name: '0001_tables',
      sql: `create table parent (id text primary key);
--> statement-breakpoint
create table child (id text primary key, parent_id text not null references parent(id));
--> statement-breakpoint
insert into parent values ('p');
--> statement-breakpoint
insert into child values ('c', 'p');`,
    }])
    expect(() => applyMigrations(db, [APPLIED, { name: '0002_orphan', sql: `delete from parent;` }])).toThrow(/0002_orphan/)
    expect(db.prepare('select count(*) as n from parent').get()).toEqual({ n: 1 })
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })
})
