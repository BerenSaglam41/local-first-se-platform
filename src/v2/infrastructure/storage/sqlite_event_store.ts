import { open, Database } from 'sqlite';
import * as sqlite3 from 'sqlite3';
import { DomainEvent, IEventStore } from '../../contracts/ievent_store';

export class SqliteEventStore implements IEventStore {
  private db: Database | null = null;

  constructor(private dbPath: string) {}

  async connect(): Promise<Database> {
    if (this.db) return this.db;

    const sqlite3Mod = require('sqlite3');
    const sqliteDriver = sqlite3Mod?.Database || sqlite3Mod?.default?.Database || sqlite3Mod?.default?.default?.Database || (sqlite3 as any).Database;

    this.db = await open({
      filename: this.dbPath,
      driver: sqliteDriver,
    });

    await this.db.run('PRAGMA foreign_keys = ON');
    await this.db.run('PRAGMA journal_mode = WAL');
    await this.db.run('PRAGMA busy_timeout = 5000');

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS domain_events_v2 (
        event_id TEXT PRIMARY KEY,
        aggregate_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        version INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_aggregate ON domain_events_v2(aggregate_id);
    `);

    return this.db;
  }

  async append(event: DomainEvent): Promise<void> {
    const db = await this.connect();
    await db.run(
      `INSERT INTO domain_events_v2 (event_id, aggregate_id, event_type, version, timestamp, actor_id, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        event.eventId,
        event.aggregateId,
        event.eventType,
        event.version,
        event.timestamp,
        event.actorId,
        JSON.stringify(event.payload || {}),
      ]
    );
  }

  async readStream(aggregateId: string): Promise<DomainEvent[]> {
    const db = await this.connect();
    const rows = await db.all<any[]>(
      `SELECT * FROM domain_events_v2 WHERE aggregate_id = ? ORDER BY timestamp ASC`,
      [aggregateId]
    );
    return rows.map((r) => ({
      eventId: r.event_id,
      aggregateId: r.aggregate_id,
      eventType: r.event_type,
      version: r.version,
      timestamp: r.timestamp,
      actorId: r.actor_id,
      payload: JSON.parse(r.payload),
    }));
  }

  async replayAll(handler: (event: DomainEvent) => void): Promise<void> {
    const db = await this.connect();
    const rows = await db.all<any[]>(`SELECT * FROM domain_events_v2 ORDER BY timestamp ASC`);
    for (const r of rows) {
      handler({
        eventId: r.event_id,
        aggregateId: r.aggregate_id,
        eventType: r.event_type,
        version: r.version,
        timestamp: r.timestamp,
        actorId: r.actor_id,
        payload: JSON.parse(r.payload),
      });
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}
