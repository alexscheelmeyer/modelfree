import _ from 'lodash';

export default class MemoryConnector {
  constructor(options={}) {
    const keySize = _.get(options, 'keySize', 31);
    this.keySize = keySize;

    this.tables = {};
  }

  _notifySubscribers(subscribers, id) {
    for (const s of subscribers) {
      s(id);
    }
  }

  async destroy() {
    // Do not need to do anything for a memory store
  }

  async createTable(name, keySize) {
    if (!keySize) keySize = this.keySize;
    if (!(name in this.tables)) {
      this.tables[name] = { entry: [], keySize, subscribers: [] };
    }
  }

  async countCollectionEntries(collectionName) {
    if (!(collectionName in this.tables)) {
      await this.createTable(collectionName);
    }

    return this.tables[collectionName].entry.length;
  }

  async saveCollectionDocument(collectionName, doc) {
    if (!(collectionName in this.tables)) {
      await this.createTable(collectionName);
    }

    const foundIndex = this.tables[collectionName].entry.find((d) => d._id === doc.id());
    if (foundIndex) {
      this.tables[collectionName].entry[foundIndex] = doc.value();
    } else {
      this.tables[collectionName].entry.push(doc.value());
    }
    this._notifySubscribers(this.tables[collectionName].subscribers, doc.id());
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

    const foundIndex = this.tables[collectionName].entry.findIndex((d) => d._id === key);
    if (foundIndex >= 0)
      return this.tables[collectionName].entry[foundIndex];

    return undefined;
  }

  async allCollectionDocuments(collectionName) {
    if (!(collectionName in this.tables)) {
      await this.createTable(collectionName);
    }

    return this.tables[collectionName].entry;
  }

  async getCollectionRandomDocument(collectionName) {
    if (collectionName in this.tables) {
      const numRows = this.tables[collectionName].entry.length
      const randomIndex = Math.floor(Math.random() * numRows);
      return this.tables[collectionName].entry[randomIndex];
    }

    return null;
  }

  async deleteCollectionDocument(collectionName, key) {
    if (!key) throw new Error(`Bad id ${key} for delete`);

    const foundIndex = this.tables[collectionName].entry.find((d) => d._id === key);
    if (foundIndex)
      this.tables[collectionName].entry.splice(foundIndex, 1);
  }

  async deleteAllCollectionDocuments(collectionName) {
    if (collectionName in this.tables)
      this.tables[collectionName].entry = [];
  }

  async subscribeCollectionChanges(collectionName, cb) {
    if (collectionName in this.tables)
      this.tables[collectionName].subscribers.push(cb);
  }

  async unsubscribeCollectionChanges(collectionName, cb) {
    if (collectionName in this.tables) {
      const foundIndex = this.tables[collectionName].subscribers.find((s) => s === cb);
      if (foundIndex)
        this.tables[collectionName].subscribers.splice(foundIndex, 1);
    }
  }
}

