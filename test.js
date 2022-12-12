import { ModelFree, PostGresConnector } from './index.js';

async function test() {
  const mf = new ModelFree(new PostGresConnector());
  const widgets = await mf.collection('widgets');
  console.log(`${await widgets.count()} widgets found`);

  const widget = await widgets.new({ name: 'my widget' });
  console.log(`${await widgets.count()} widgets found`);

  const alsoWidget = await widgets.get(widget.id());
  console.log(widget.name, alsoWidget.name);

  alsoWidget.name = 'my updated widget';
  await alsoWidget.save();

  const sameWidget = await widgets.get(widget.id());
  console.log(alsoWidget.name, sameWidget.name);

  const otherWidget = await widgets.new({ name: 'different widget' });
  console.log(`${await widgets.count()} widgets found`);

  for (let i = 0; i < 10; i++) {
    const randomWidget = await widgets.random();
    console.log(randomWidget.id());
  }

  await widget.delete();
  console.log(`${await widgets.count()} widgets found`);

  await widgets.deleteAll();
  console.log(`${await widgets.count()} widgets found`);



  // widgets.count().then((c) => console.log('count', c));
  // widgets.all()
  //   .then((rows) => console.log('rows', rows));
}

test();
