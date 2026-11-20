// tests/keyword-match-html-end-tags.test.mjs — htmlToText must drop a script or
// style block whatever its end tag looks like. A browser accepts attributes and
// whitespace in an end tag (`</script foo>`, `</script >`), so a pattern that
// only knows `</script>` leaves the block's body in the visible text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText } from '../keyword-match.mjs';

const cases = [
  ['plain end tag', '<script>secret()</script>'],
  ['space before >', '<script>secret()</script >'],
  ['attribute in end tag', '<script>secret()</script foo>'],
  ['attribute with value', '<script>secret()</script foo="bar">'],
  ['newline in end tag', '<script>secret()</script\n>'],
  ['upper case', '<SCRIPT>secret()</SCRIPT FOO>'],
  ['style with attribute', '<style>secret{}</style foo>'],
  ['style with space', '<style>secret{}</style >'],
];

for (const [name, block] of cases) {
  test(`htmlToText drops a block closed by: ${name}`, () => {
    assert.equal(htmlToText(`<p>Before</p>${block}<p>After</p>`), 'Before After');
  });
}

test('htmlToText keeps text after a longer tag name that only starts with script', () => {
  assert.equal(htmlToText('<script>a()</scriptx>b</script>c'), 'c');
});

// LG-2: a single strip pass can splice a new tag or comment out of what it leaves behind.
test('htmlToText strips to a fixed point and honours --!> comment ends', () => {
  assert.ok(!htmlToText('<scr<b>ipt>x</script>').includes('<'));
  assert.ok(!/<[a-z!]/i.test(htmlToText('<<!---->!-- hidden --><p>shown</p>')));
  assert.equal(htmlToText('a<!-- x --!>b'), 'a b');
});
