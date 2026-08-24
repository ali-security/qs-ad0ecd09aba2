'use strict';

var test = require('tape');
var utils = require('../lib/utils');

test('merge()', function (t) {
    t.deepEqual(utils.merge({ a: 'b' }, { a: 'c' }), { a: ['b', 'c'] }, 'merges two objects with the same key');

    t.test('with overflow objects (from arrayLimit)', function (st) {
        st.test('merges primitive into overflow object at next index', function (s2t) {
            // Create an overflow object via combine
            var overflow = utils.combine(['a'], 'b', 1, false);
            s2t.ok(utils.isOverflow(overflow), 'overflow object is marked');

            var merged = utils.merge(overflow, 'c');
            s2t.notOk(Array.isArray(merged), 'the result is not an array');
            s2t.deepEqual(merged, { 0: 'a', 1: 'b', 2: 'c' }, 'adds primitive at next numeric index');
            s2t.end();
        });

        st.test('merges primitive into regular object with numeric keys normally', function (s2t) {
            var obj = { 0: 'a', 1: 'b' };
            s2t.notOk(utils.isOverflow(obj), 'plain object is not marked as overflow');

            var merged = utils.merge(obj, 'c');
            s2t.deepEqual(merged, { 0: 'a', 1: 'b', c: true }, 'adds primitive as key (not at next index)');
            s2t.end();
        });

        st.test('merges primitive into object with non-numeric keys normally', function (s2t) {
            var obj = { foo: 'bar' };
            var merged = utils.merge(obj, 'baz');
            s2t.deepEqual(merged, { foo: 'bar', baz: true }, 'adds primitive as key with value true');
            s2t.end();
        });

        st.test('merges overflow object into primitive', function (s2t) {
            // Create an overflow object via combine
            var overflow = utils.combine([], 'b', 0, false);
            s2t.ok(utils.isOverflow(overflow), 'overflow object is marked');

            var merged = utils.merge('a', overflow);
            s2t.ok(utils.isOverflow(merged), 'result is also marked as overflow');
            s2t.notOk(Array.isArray(merged), 'the result is not an array');
            s2t.deepEqual(merged, { 0: 'a', 1: 'b' }, 'creates object with primitive at 0, source values shifted');
            s2t.end();
        });

        st.test('merges overflow object with multiple values into primitive', function (s2t) {
            // Create an overflow object via combine
            var overflow = utils.combine(['b'], 'c', 1, false);
            s2t.ok(utils.isOverflow(overflow), 'overflow object is marked');

            var merged = utils.merge('a', overflow);
            s2t.deepEqual(merged, { 0: 'a', 1: 'b', 2: 'c' }, 'shifts all source indices by 1');
            s2t.end();
        });

        st.test('merges regular object into primitive as array', function (s2t) {
            var obj = { foo: 'bar' };
            var merged = utils.merge('a', obj);
            s2t.deepEqual(merged, ['a', { foo: 'bar' }], 'creates array with primitive and object');
            s2t.end();
        });

        st.test('a marker-shaped key from the query string cannot forge an overflow object', function (s2t) {
            var forged = { 0: 'a' };
            forged.__qs_arrayLimitOverflow__ = 0;
            s2t.notOk(utils.isOverflow(forged), 'an enumerable marker-shaped key is not trusted');

            var merged = utils.merge(forged, 'b');
            s2t.equal(typeof merged[1], 'undefined', 'nothing is appended at the next numeric index');
            s2t.equal(merged.b, true, 'the primitive is added as a key, as for any plain object');
            s2t.end();
        });

        st.test('a marker-shaped key from the query string cannot clobber a real marker', function (s2t) {
            var overflow = utils.combine(['a'], 'b', 1, false);
            s2t.ok(utils.isOverflow(overflow), 'overflow object is marked');

            var merged = utils.merge(overflow, { __qs_arrayLimitOverflow__: '99' });
            s2t.ok(utils.isOverflow(merged), 'the marker survives the merge');
            s2t.notOk(Array.isArray(merged), 'the result is not an array');
            s2t.deepEqual(merged, { 0: 'a', 1: 'b' }, 'the marker-shaped key is dropped');
            s2t.deepEqual(
                utils.merge(merged, 'c'),
                { 0: 'a', 1: 'b', 2: 'c' },
                'arrayLimit accounting still works afterwards'
            );
            s2t.end();
        });

        st.end();
    });

    t.end();
});

test('combine()', function (t) {
    t.test('basic combination', function (st) {
        st.deepEqual(utils.combine('a', 'b', 10, false), ['a', 'b'], 'combines primitives into array');
        st.deepEqual(utils.combine(['a'], 'b', 10, false), ['a', 'b'], 'appends to array');
        st.end();
    });

    t.test('with arrayLimit', function (st) {
        st.test('under the limit', function (s2t) {
            var combined = utils.combine(['a', 'b'], 'c', 10, false);
            s2t.deepEqual(combined, ['a', 'b', 'c'], 'returns array when under limit');
            s2t.ok(Array.isArray(combined), 'result is an array');
            s2t.notOk(utils.isOverflow(combined), 'result is not marked as overflow');
            s2t.end();
        });

        st.test('exactly at the limit stays as array', function (s2t) {
            var combined = utils.combine(['a', 'b'], 'c', 3, false);
            s2t.deepEqual(combined, ['a', 'b', 'c'], 'stays as array when exactly at limit');
            s2t.ok(Array.isArray(combined), 'result is an array');
            s2t.end();
        });

        st.test('over the limit', function (s2t) {
            var combined = utils.combine(['a', 'b', 'c'], 'd', 3, false);
            s2t.deepEqual(combined, { 0: 'a', 1: 'b', 2: 'c', 3: 'd' }, 'converts to object when over limit');
            s2t.notOk(Array.isArray(combined), 'result is not an array');
            s2t.ok(utils.isOverflow(combined), 'result is marked as overflow');
            s2t.end();
        });

        st.test('with arrayLimit 0', function (s2t) {
            var combined = utils.combine([], 'a', 0, false);
            s2t.deepEqual(combined, { 0: 'a' }, 'converts single element to object with arrayLimit 0');
            s2t.notOk(Array.isArray(combined), 'result is not an array');
            s2t.end();
        });

        st.test('with plainObjects option', function (s2t) {
            var combined = utils.combine(['a'], 'b', 1, true);
            s2t.equal(Object.getPrototypeOf(combined), null, 'result has null prototype when plainObjects is true');
            s2t.notOk(Array.isArray(combined), 'result is not an array');
            s2t.deepEqual(Object.keys(combined), ['0', '1'], 'only the values are enumerable');
            s2t.equal(combined[0], 'a', 'index 0 is preserved');
            s2t.equal(combined[1], 'b', 'index 1 is preserved');
            s2t.ok(utils.isOverflow(combined), 'a null prototype overflow object is still marked');
            s2t.end();
        });

        st.test('the overflow marker is not enumerable', function (s2t) {
            var combined = utils.combine(['a'], 'b', 1, false);
            s2t.deepEqual(Object.keys(combined), ['0', '1'], 'only the values are enumerable');
            s2t.equal(JSON.stringify(combined), '{"0":"a","1":"b"}', 'the marker does not leak into JSON');
            s2t.end();
        });

        st.end();
    });

    t.test('with existing overflow object', function (st) {
        st.test('adds to existing overflow object at next index', function (s2t) {
            // Create overflow object first via combine
            var overflow = utils.combine(['a'], 'b', 1, false);
            s2t.ok(utils.isOverflow(overflow), 'initial object is marked as overflow');

            var combined = utils.combine(overflow, 'c', 10, false);
            s2t.equal(combined, overflow, 'returns the same object (mutated)');
            s2t.deepEqual(combined, { 0: 'a', 1: 'b', 2: 'c' }, 'adds value at next numeric index');
            s2t.notOk(Array.isArray(combined), 'a raised arrayLimit does not turn it back into an array');
            s2t.end();
        });

        st.test('does not treat plain object with numeric keys as overflow', function (s2t) {
            var plainObj = { 0: 'a', 1: 'b' };
            s2t.notOk(utils.isOverflow(plainObj), 'plain object is not marked as overflow');

            // combine treats this as a regular value, not an overflow object to append to
            var combined = utils.combine(plainObj, 'c', 10, false);
            s2t.deepEqual(combined, [{ 0: 'a', 1: 'b' }, 'c'], 'concatenates as regular values');
            s2t.end();
        });

        st.test('does not append to an object carrying a forged, enumerable marker', function (s2t) {
            var forged = { 0: 'a' };
            forged.__qs_arrayLimitOverflow__ = 5;
            s2t.notOk(utils.isOverflow(forged), 'an enumerable marker-shaped key is not trusted');

            var combined = utils.combine(forged, 'b', 10, false);
            s2t.ok(Array.isArray(combined), 'concatenates as regular values');
            s2t.equal(combined.length, 2, 'no value is written at the forged index');
            s2t.equal(typeof forged[6], 'undefined', 'the forged object is not mutated at index 6');
            s2t.end();
        });

        st.end();
    });

    t.end();
});
