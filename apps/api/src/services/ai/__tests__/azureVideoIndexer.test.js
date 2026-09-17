const test = require('node:test');
const assert = require('node:assert/strict');
const { viTimeToMs, mapPeople, mapScenes } = require('../azureVideoIndexer.ts');

test('viTimeToMs parses Azure VI TimeSpan strings and numeric seconds', () => {
  assert.equal(viTimeToMs(6.34), 6340);
  assert.equal(viTimeToMs('6.34'), 6340);
  assert.equal(viTimeToMs('0:00:06.34'), 6340);
  assert.equal(viTimeToMs('00:01:21.067'), 81067);
  assert.equal(viTimeToMs('0:00:00'), 0);
  assert.equal(viTimeToMs('not-a-time'), 0);
  assert.equal(viTimeToMs(null), 0);
});

test('mapPeople uses face.instances TimeSpans (Azure VI shape)', () => {
  const people = mapPeople(
    {
      faces: [
        {
          id: 1785,
          name: 'Emily Tran',
          thumbnailId: 'fd2720f7-b029-4e01-af44-3baf4720c531',
          instances: [
            { start: '0:00:05', end: '0:00:10.5' },
            { start: '0:01:00', end: '0:01:30' },
          ],
        },
        {
          id: 99,
          name: 'Unknown',
          instances: [{ start: '0:00:00', end: '0:00:04' }],
        },
      ],
    },
    'trial',
    'acct',
    'vid',
    'tok',
  );

  assert.equal(people.length, 2);
  assert.equal(people[0].displayLabel, 'Emily Tran');
  assert.equal(people[0].startMs, 5000);
  assert.equal(people[0].endMs, 90000);
  assert.match(people[0].thumbnailUrl, /Thumbnails\/fd2720f7/);
  assert.equal(people[1].displayLabel, 'Person 2');
  assert.equal(people[1].startMs, 0);
  assert.equal(people[1].endMs, 4000);
});

test('mapPeople skips faces with neither instances nor appearances', () => {
  const people = mapPeople(
    { faces: [{ id: 1, name: 'No Times' }] },
    'trial',
    'acct',
    'vid',
    'tok',
  );
  assert.equal(people.length, 0);
});

test('mapScenes reads scene/label instances with TimeSpan times', () => {
  const scenes = mapScenes({
    scenes: [
      { id: 0, instances: [{ start: '0:00:00', end: '0:00:06.34' }] },
      { id: 1, instances: [{ start: '0:00:06.34', end: '0:00:47.047' }] },
    ],
    labels: [
      {
        name: 'person',
        instances: [
          { confidence: 0.99, start: '0:00:00', end: '0:00:26.667' },
          { confidence: 0.98, start: '0:01:21.067', end: '0:01:41.334' },
        ],
      },
      {
        name: 'indoor',
        // no instances / appearances — must not force a 0:00 chip
      },
    ],
  });

  assert.equal(scenes[0].label, 'Scene 1');
  assert.equal(scenes[0].startMs, 0);
  assert.equal(scenes[0].endMs, 6340);

  assert.equal(scenes[1].label, 'Scene 2');
  assert.equal(scenes[1].startMs, 6340);
  assert.equal(scenes[1].endMs, 47047);

  const personLabels = scenes.filter((s) => s.label === 'person');
  assert.equal(personLabels.length, 2);
  assert.equal(personLabels[0].startMs, 0);
  assert.equal(personLabels[0].endMs, 26667);
  assert.equal(personLabels[1].startMs, 81067);

  assert.equal(scenes.some((s) => s.label === 'indoor'), false);
  assert.ok(scenes.every((s) => typeof s.startMs === 'number'));
  assert.ok(scenes.some((s) => s.startMs > 0));
});

test('mapPeople still supports legacy appearances + startSeconds', () => {
  const people = mapPeople(
    {
      faces: [
        {
          id: 'legacy',
          name: 'Legacy Face',
          appearances: [{ startSeconds: 12.5, endSeconds: 20 }],
        },
      ],
    },
    'trial',
    'acct',
    'vid',
    'tok',
  );
  assert.equal(people.length, 1);
  assert.equal(people[0].startMs, 12500);
  assert.equal(people[0].endMs, 20000);
});
