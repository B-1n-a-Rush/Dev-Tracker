const runtimeFile = require('./helpers/runtime-file.cjs');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const review = require(runtimeFile('trackside-owner-route-review.js'));

const bundled = {name: 'Example BRT', color: '#001122', lines: [[[33.75,-84.40],[33.75,-84.39]]]};
const upload = {name: bundled.name, remoteId:'5', isPublished: true, color:'#b84f2a', lines: [[[33.70,-84.39],[33.72,-84.39]]]};
const makePlan = options => review.plan({
  entry: {route: upload, bundled: false}, bundled: [bundled], uploaded: [upload],
  visibility: new Map(), asLines: geometry => geometry.coordinates,
  ...options
});

test('preview uses existing fallback precedence and leaves the route catalog unchanged', () => {
  const hidden = makePlan({published:false});
  assert.equal(hidden.prior, upload);
  assert.equal(hidden.expected, bundled);
  const disabled = makePlan({published:false, visibility: new Map([[bundled.name, {is_published:false}]])});
  assert.equal(disabled.expected, undefined);
  const draft = makePlan({published:true, replacement:{geometry:{coordinates:bundled.lines},miles:1}});
  assert.equal(draft.expected.remoteId, upload.remoteId);
  assert.equal(draft.expected.color, upload.color);
  assert.deepEqual(draft.expected.lines, bundled.lines);
  assert.notDeepEqual(upload.lines, draft.expected.lines);
});

test('affected project lists include gains and losses and use passed route matching rules', () => {
  const before = [upload], after = [bundled];
  const projects = [{name:'A',old:true},{name:'B',old:false},{name:'C',always:true}];
  const matches = (project, routes) => project.always || (project.old === (routes === before)) ? routes : [];
  assert.deepEqual(review.projectChanges(projects,before,after,matches).map(({project,gained,lost})=>[project.name,gained,lost]),[
    ['A',[],[upload.name]], ['B',[bundled.name],[]]
  ]);
});

test('a public check rejects an alternative geometry or missing share-link selection', async () => {
  const identity = await review.identity(upload, route => route.lines);
  const valid = {count:1, route:identity, shown:true, overview:true, sourcesReady:true};
  assert.equal(review.checkResult(identity,valid),'');
  assert.match(review.checkResult(identity,{...valid,overview:false}),/share link/);
  assert.match(review.checkResult(identity,{...valid,route:await review.identity({...upload,lines:bundled.lines},route=>route.lines)}),/different route/);
  assert.match(review.checkResult(identity,{...valid,sourcesReady:false}),/did not finish/);
  assert.match(review.checkResult(null,valid),/unexpected/);
  assert.equal(review.checkResult(null,{count:0, sourcesReady:true, overview:false}),'');
});
