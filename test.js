import { ModelFree, PostGresConnector } from './index.js';

async function test() {
  const mf = new ModelFree(new PostGresConnector());
  const widgets = await mf.collection('widgets');
  console.log(`${await widgets.count()} widgets found`);

  const widget = await widgets.new({ name: 'my widget' });
  await widget.save();
  console.log(`${await widgets.count()} widgets found`);

  const alsoWidget = await widgets.get(widget.id());
  console.log(widget.name, alsoWidget.name);


  // widgets.count().then((c) => console.log('count', c));
  // widgets.all()
  //   .then((rows) => console.log('rows', rows));
}

test();
