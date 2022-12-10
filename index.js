import _ from 'lodash';
import { Sql } from 'sql';
import pg from 'pg';

const { Pool } = pg;


function randomId(size=64) {
  let id = '';
  while (id.length < size) {
   id += Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5);
  }

  return id.substring(0, size);
}

export class PostGresConnector {
  constructor(options={}) {
    const keySize = _.get(options, 'keySize', 31);
    this.keySize = keySize;
    const username = _.get(options, 'username', 'postgres');
    const databaseName = _.get(options, 'databaseName', 'modelfree');
    const connectionString = _.get(options, 'connectionString', `postgresql://${username}@localhost:5432`);
    const sql = new Sql('postgres');
    this.sql = sql;

    this.pool = new Pool({ connectionString });
    this.pool.on('error', (err, client) => {
      console.error(`${(new Date()).toISOString()} - Error on postgres pool: ${err}`);
    });

    const query = (sql) => this.pool.query(sql).then((data) => data.rows);

    const createDB = async () => {
      const res = await query(`SELECT COUNT(*) FROM pg_database WHERE datname = '${databaseName}'`);
      const found = parseInt(_.get(res, [0, 'count'], 0), 10) > 0;
      if (!found) {
        await query(`CREATE DATABASE ${databaseName}`);
      }
    };

    this.tables = {};

    this.query = async (sqlObj) => {
      await createDB();

      return query(sqlObj.toString())
        .catch(err => console.error(`${(new Date()).toISOString()} - Query error: ${err}`));
    };
  }

  async createTable(name, keySize) {
    if (!keySize) keySize = this.keySize;
    let entry = this.tables[name];
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
      this.tables[name] = { entry, keySize };
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
}

export class Document {
  constructor(properties, collection) {
    for (const key in properties) this[key] = properties[key];
    this._collection = collection;
    this._id = randomId(collection.keySize());
  }

  id() {
    return this._id;
  }
  
  value() {
    return _.omit(this, ['_collection']);
  }

  async save() {
    return this._collection.saveDoc(this);
  }
}

export class Collection {
  constructor(mf, name) {
    if (!mf) throw new Error('Missing ModelFree instance');
    if (!name) throw new Error('Missing collection name');
    if (!mf instanceof ModelFree) throw new Error('Needs ModelFree instance as first argument');
    if (typeof name !== 'string') throw new Error('Name of collection must be a string');

    this.mf = mf;
    this.name = name;
  }

  async count() {
    return this.mf.connector().countCollectionEntries(this.name);
  }

  async new(properties) {
    return new Document(properties, this);
  }

  async saveDoc(doc) {
    return this.mf.connector().saveCollectionDocument(this.name, doc);
  }

  keySize() {
    return this.mf.connector().getCollectionKeySize(this.name);
  }

  async get(id) {
    const data = await this.mf.connector().getCollectionDocumentById(this.name, id);
    if (data) {
      return new Document(data, this);
    }
    return null;
	}

}

export class ModelFree {
  constructor(connector) {
    if (!connector === undefined) throw new Exception('Missing database connector');

    this._connector = connector;
  }

  collection(name) {
    return new Collection(this, name);
  }

  connector() {
    return this._connector;
  }

  all() {
		const select = this.entry.select();
		return this.query(select)
      .then((rows) => rows.map((row) => JSON.parse(row.value)));
  }

  count() {
    const count = this.entry.select(this.entry.count());
    return this.query(count)
      .then((countRow) => {
        console.log('eeeee', countRow);
        const numRows = _.get(countRow, [0, `${this.name}_count`], 0);
        return numRows;
      });
  }

  getRandom() {
    return this.count()
      .then((numRows) => {
        if (!numRows) {
          return undefined;
        }
        const select = this.entry.select().limit(1).offset(Math.floor(Math.random() * numRows));
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

	set(key, value) {
		const upsert = this.entry.insert({ key, value:JSON.stringify(value) }).onConflict({ columns: ['key'], update: ['value'] });
		return this.query(upsert);
	}

	delete(key) {
    if (!key) throw new Error(`Bad key ${key} for delete`);

		const select = this.entry.select().where({ key });
		const del = this.entry.delete().where({ key });
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

	clear() {
		const del = this.entry.delete();
		return this.query(del)
			.then(() => undefined);
	}
}
