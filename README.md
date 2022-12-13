# ModelFree
This wraps the messy parts of doing CRUD operations with a database for persistence. Most databases can do
all sorts of advanced things but unfortunately it also often means that they are not very streamlined for
the simple usecases.

ModelFree gives you a schemaless interface for storing documents (objects) based on unique keys. Behind the
scenes it uses "connectors" to map this interface to various database backends. Currently the supported connectors
are `PostGres` and `Memory`.

## Warning
This has not been testet completely for input sanitization and you should be careful when using user-input as values as
it could end up in a query and cause a vulnerability.

## Usage
This package uses es6 import syntax, so be sure to use Node >= V13.

```js
import { ModelFree, PostGresConnector } from 'modelfree';
```

You start by making an instance of the ModelFree class by providing a database connector to the constructor.

```js
const mf = new ModelFree(new PostGresConnector());
```

after that you can get a reference to a collection (it will be created automatically if it does not already exist):

```js
const widgets = await mf.collection('widgets');
```

then, with the collection you can create new documents:


```js
const widget = await widgets.new({ name: 'my widget' });
```

and each document exposes a `id` method that you can use to lookup documents:

```js
const widgetCopy = await widgets.get(widget.id());
```


## API Reference

### `PostGresConnector constructor`
You can use this without any parameters but it takes one parameter which is an options object. You will often need to
use this unless your usecase involves the default connection-string for Postgres. The default connection-string is
`postgresql://<username>@<hostname>:<port>/<databaseName>` where the default values are:

 - `username` = "postgres"
 - `hostname` = "localhost"
 - `port` = 5432
 - `databaseName` = "postgres"

All of those can be customized by providing the values in the options object. The `databaseName` is the name of the database
to use for the collections, and if it does not exist it will be created.

You can also provide these properties:

 - `connectionString` - If this is provided you will override the default construction of the connection-string and you
   can do whatever you need.
 - `keySize` - provide this if you want to customize the size of the key (id) used for each Document. The default size
   is 31 and the id consists of a string of lowercase characters a-z.


### `MemoryConnector constructor`
For doing unittests and other usecases where persistence is not needed, there is a `MemoryConnector` class that can be
used in place of a real database connector. It only takes one property for its options object, which is the `keySize`
(with a default value of 31).


### `collection.count()`
Returns a promise that resolves to the number of documents in the collection.

### `collection.new(<object>)`
This creates a new `Document` from a provided object and returns it (inside a promise). The document will have a `._id` property
which is also what the `.id()` method returns and if it is not provided as part of the input-object, a random id will be generated.

```js
const widget = await widgets.new({ name: 'my widget' });
// widget contains _id and name properties
```

### `collection.random()`
Returns a promise that resolves to a randomly selected document from the collection. If no documents at all exists in the collection
`null` will be returned.

### `collection.get(<id>)`
Returns a promise that resolves to the document with the given id, if found in the collection. Otherwise it returns `null`.


### `document.id()`
Returns the id of the document, which used when looking up documents in the collection.

### `document.value()`
Returns the object represented by the Document which typically would be the original object given to `collection.new` but with an
extra `._id` property added.

### `document.save`
This updates the database with the values of the document. Used when you are mutating the values of the document and want the updates
to be persisted back to the database. Returns a promise that resolves when the data has been saved successfully.

### `document.delete`
This will delete the document from the collection where it came from. Returns a promise that resolves when the document has been deleted.
Note that if you then call `.save` on the document it will be recreated in the collection, you will not get an error.


## Various

Author: Alex Scheel Meyer

License: MIT
