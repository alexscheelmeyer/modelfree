import _ from 'lodash';
import { Sql } from 'sql';
import pg from 'pg';

const { Pool } = pg;

export default class PostGresConnector {
  constructor(options={}) {
    const keySize = _.get(options, 'keySize', 31);
    this.keySize = keySize;
    const hostname = _.get(options, 'hostname', 'localhost');
    const port = _.get(options, 'port', 5432);
    const username = _.get(options, 'username', 'postgres');
    const password = _.get(options, 'password', '');
    const databaseName = _.get(options, 'databaseName', 'postgres');
    const connectionString = _.get(options, 'connectionString', `postgresql://${username}:${password}@${hostname}:${port}/${databaseName}`);
    this.connectionString = connectionString;
    const sql = new Sql('postgres');
    this.sql = sql;

    this.pool = new Pool({ connectionString });
    this.pool.on('error', (err, client) => {
      console.error(`${(new Date()).toISOString()} - Error on postgres pool: ${err}`);
    });

    const query = (sql) => this.pool.query(sql).then((data) => data.rows);

    this.databaseCreated = false;
    const createDB = async () => {
      const res = await query(`SELECT COUNT(*) FROM pg_database WHERE datname = '${databaseName}'`);
      const found = parseInt(_.get(res, [0, 'count'], 0), 10) > 0;
      if (!found) {
        await query(`CREATE DATABASE ${databaseName}`);
      }
      this.databaseCreated = true;
    };

    this.tables = {};

    this.query = async (sqlObj) => {
      await createDB();

      return query(sqlObj.toString())
        .catch(err => console.error(`${(new Date()).toISOString()} - Query error: ${err}`));
    };
  }

  async destroy() {
    await this.pool.end();
    if (this.listenClient) {
      this.listenClient.end();
    }
  }

  async createTable(name, keySize) {
    if (!keySize) keySize = this.keySize;
    let entry;
    if (name in this.tables) entry = this.tables[name].entry;
    if (!entry) {
      entry = this.sql.define({ name,
        columns: [
          {
            name: 'key',
            primaryKey: true,
            dataType: `VARCHAR(${Number(keySize)})`
          },
          {
            name: 'value',
            dataType: 'TEXT'
          }
        ]
      });
      this.tables[name] = { entry, keySize, subscribers: [] };
    }

    return this.query(entry.create().ifNotExists().toString());
  }

  async countCollectionEntries(collectionName) {
    if (!(collectionName in this.tables)) {
      await this.createTable(collectionName);
    }

    const res = await this.query(`SELECT count(*) FROM ${collectionName}`);
    const numRows = _.get(res, [0, 'count'], 0);
    return numRows;
  }

  async saveCollectionDocument(collectionName, doc) {
    if (!(collectionName in this.tables)) {
      await this.createTable(collectionName);
    }

		const upsert = this.tables[collectionName].entry.insert({ key: doc.id(), value:JSON.stringify(doc.value()) })
      .onConflict({ columns: ['key'], update: ['value'] });
		return this.query(upsert);
  }

  getCollectionKeySize(collectionName) {
    if (collectionName in this.tables)
      return this.tables[collectionName].keySize;
    throw new Error('Failed to get key size');
  }

  async getCollectionDocumentById(collectionName, key) {
    if (!(collectionName in this.tables)) {
      await this.createTable(collectionName);
    }

		const select = this.tables[collectionName].entry.select().where({ key });
		return this.query(select)
			.then(rows => {
				const row = rows && rows[0];
				if (row === undefined) {
					return undefined;
				}
				return JSON.parse(row.value);
			});
  }

  async allCollectionDocuments(collectionName) {
    if (!(collectionName in this.tables)) {
      await this.createTable(collectionName);
    }

		const select = this.tables[collectionName].entry.select();
		return this.query(select)
			.then(rows => {
        if (!rows) return undefined;
        return rows.map((r) => JSON.parse(r.value));
			});
  }

  async getCollectionRandomDocument(collectionName) {
    return this.countCollectionEntries(collectionName)
      .then((numRows) => {
        if (!numRows) {
          return undefined;
        }
        const select = this.tables[collectionName].entry.select().limit(1).offset(Math.floor(Math.random() * numRows));
        return this.query(select)
          .then(rows => {
            const row = rows && rows[0];
            if (row === undefined) {
              return undefined;
            }
            return JSON.parse(row.value);
          });
      });
  }

  async deleteCollectionDocument(collectionName, key) {
    if (!key) throw new Error(`Bad id ${key} for delete`);

    // This selects to make sure the id exists, could we just try to delete and ignore any errors?
		const select = this.tables[collectionName].entry.select().where({ key });
		const del = this.tables[collectionName].entry.delete().where({ key });
		return this.query(select)
			.then(rows => {
				const row = rows[0];
				if (row === undefined) {
					return false;
				}
				return this.query(del)
					.then(() => true);
			});
  }

  async deleteAllCollectionDocuments(collectionName) {
		const del = this.tables[collectionName].entry.delete();
		return this.query(del)
			.then(() => undefined);
  }

  async subscribeCollectionChanges(collectionName, cb) {
    if (collectionName in this.tables) {
      if (this.tables[collectionName].subscribers.length === 0) {
        const createFunction = `CREATE OR REPLACE FUNCTION public.notify_${collectionName}_changed()
          RETURNS trigger
          LANGUAGE plpgsql
        AS $function$
        BEGIN
          PERFORM pg_notify('${collectionName}_event', row_to_json(NEW)::text);
          RETURN NULL;
        END
        $function$`;
        await this.query(createFunction);

        const createTrigger = `CREATE OR REPLACE TRIGGER updated_${collectionName}_trigger AFTER INSERT OR UPDATE ON ${collectionName} FOR EACH ROW EXECUTE PROCEDURE notify_${collectionName}_changed();`;
        await this.query(createTrigger);

        const listenClient = new pg.Client(this.connectionString);
        await listenClient.connect();
        await listenClient.query(`LISTEN "${collectionName}_event"`);
        listenClient.on('notification', async (data) => {
          const payload = JSON.parse(data.payload);
          for (const s of this.tables[collectionName].subscribers) {
            s(payload.key);
          }
        });
        this.listenClient = listenClient;
      }
      this.tables[collectionName].subscribers.push(cb);
    }
  }

  async unsubscribeCollectionChanges(collectionName, cb) {
    if (collectionName in this.tables) {
      const foundIndex = this.tables[collectionName].subscribers.find((s) => s === cb);
      if (foundIndex)
        this.tables[collectionName].subscribers.splice(foundIndex, 1);
    }
  }
}

