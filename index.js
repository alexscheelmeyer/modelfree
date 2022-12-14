import _ from 'lodash';
import PostGresConnector from './postgres.js';
import MemoryConnector from './memory.js';

export { PostGresConnector, MemoryConnector };

function randomId(size=64) {
  let id = '';
  while (id.length < size) {
   id += Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5);
  }

  return id.substring(0, size);
}

export class Document {
  constructor(properties, collection) {
    for (const key in properties) this[key] = properties[key];
    this._collection = collection;
    if (!this._id) {
      this._id = randomId(collection.keySize());
    }
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

  async delete() {
    return this._collection.deleteDoc(this.id());
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
    const doc = new Document(properties, this);
    await doc.save();
    return doc;
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

  async random() {
    const data = await this.mf.connector().getCollectionRandomDocument(this.name);
    if (data) {
      return new Document(data, this);
    }
    return null;
  }

  async all() {
    const data = await this.mf.connector().allCollectionDocuments(this.name);
    if (data) {
      return data.map((d) => new Document(d, this));
    }
    return null;
  }

	async deleteDoc(id) {
    return this.mf.connector().deleteCollectionDocument(this.name, id);
	}

	async deleteAll() {
    return this.mf.connector().deleteAllCollectionDocuments(this.name);
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

  async destroy() {
    return this._connector.destroy();
  }
}
