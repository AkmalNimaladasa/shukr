const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '../public/data/fyp-lessons.json');
test('seed FYP library is complete, balanced, sourced and phone-readable', () => {
  assert.ok(fs.existsSync(file), 'seed library must exist');
  const lessons = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(lessons));
  assert.equal(lessons.length, 30);
  const topics = ['quran', 'sunnah', 'character', 'wellbeing', 'learning', 'world'];
  const ids = new Set();
  for (const lesson of lessons) {
    assert.match(lesson.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!ids.has(lesson.id), `duplicate id ${lesson.id}`);
    ids.add(lesson.id);
    assert.ok(topics.includes(lesson.topic), lesson.id);
    for (const key of ['title', 'hook', 'body', 'takeaway']) {
      assert.equal(typeof lesson[key], 'string');
      assert.ok(lesson[key].trim().length > 0, `${lesson.id}: ${key}`);
    }
    assert.ok(lesson.title.length <= 70, lesson.id);
    assert.ok(lesson.hook.length <= 220, lesson.id);
    assert.ok(lesson.body.length <= 1100, lesson.id);
    const words = lesson.body.trim().split(/\s+/).length;
    assert.ok(words >= 45 && words <= 120, `${lesson.id}: ${words} body words`);
    assert.ok(Number.isInteger(lesson.durationSeconds));
    assert.ok(lesson.durationSeconds >= 45 && lesson.durationSeconds <= 90, lesson.id);
    assert.ok(Array.isArray(lesson.sources) && lesson.sources.length > 0, lesson.id);
    for (const source of lesson.sources) {
      assert.equal(typeof source.title, 'string');
      assert.ok(source.title.trim());
      assert.equal(new URL(source.url).protocol, 'https:');
    }
    const quiz = lesson.quiz;
    assert.ok(quiz && typeof quiz.question === 'string' && quiz.question.trim(), lesson.id);
    assert.ok(Array.isArray(quiz.options) && [3, 4].includes(quiz.options.length), lesson.id);
    assert.equal(new Set(quiz.options).size, quiz.options.length, lesson.id);
    assert.ok(quiz.options.every(option => typeof option === 'string' && option.trim()), lesson.id);
    assert.ok(Number.isInteger(quiz.answer) && quiz.answer >= 0 && quiz.answer < quiz.options.length, lesson.id);
    assert.ok(typeof quiz.explanation === 'string' && quiz.explanation.trim(), lesson.id);
  }
  for (const topic of topics) {
    assert.equal(lessons.filter(lesson => lesson.topic === topic).length, 5, topic);
  }
});
