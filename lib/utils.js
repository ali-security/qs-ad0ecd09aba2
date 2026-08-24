'use strict';

var has = Object.prototype.hasOwnProperty;

// Objects created because an array grew past `arrayLimit` are tagged with a
// non-enumerable own property holding the highest numeric index used so far.
// A non-enumerable marker is invisible to `Object.keys`, `for-in`,
// `JSON.stringify` and deep-equality checks, and unlike a side table keyed by
// identity it also works for `Object.create(null)` (`plainObjects`) results.
var overflowKey = '__qs_arrayLimitOverflow__';

var isOverflow = function isOverflow(obj) {
    if (!obj || typeof obj !== 'object' || !has.call(obj, overflowKey)) {
        return false;
    }

    // Keys coming off the wire are always enumerable, so requiring a
    // non-enumerable numeric marker means user input can never forge one.
    var descriptor = Object.getOwnPropertyDescriptor(obj, overflowKey);
    return !!descriptor && !descriptor.enumerable && typeof descriptor.value === 'number';
};

var markOverflow = function markOverflow(obj, maxIndex) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    var descriptor = Object.getOwnPropertyDescriptor(obj, overflowKey);
    if (descriptor && descriptor.enumerable) {
        // A same-named key arrived from the query string; leave it alone.
        return obj;
    }

    Object.defineProperty(obj, overflowKey, {
        configurable: true,
        enumerable: false,
        value: maxIndex,
        writable: true
    });

    return obj;
};

var getMaxIndex = function getMaxIndex(obj) {
    return isOverflow(obj) ? obj[overflowKey] : undefined;
};

// Appends at the next *free* numeric index: the key-by-key `merge` path can
// write numeric keys without moving the cursor, so a blind `maxIndex + 1`
// would silently clobber a value from `a[2]=z`.
var appendOverflow = function appendOverflow(obj, value) {
    var index = getMaxIndex(obj) + 1;
    while (has.call(obj, index)) {
        index += 1;
    }

    obj[index] = value;

    return markOverflow(obj, index);
};

// Builds a fresh overflow object with `target` at index 0 and every numeric
// key of `source` shifted up by one; non-numeric keys are preserved as-is.
var prependToOverflow = function prependToOverflow(target, source, plainObjects) {
    var result = plainObjects ? Object.create(null) : {};
    result[0] = target;

    var sourceKeys = Object.keys(source);
    for (var i = 0; i < sourceKeys.length; ++i) {
        var sourceKey = sourceKeys[i];
        if (sourceKey === '__proto__' || sourceKey === overflowKey) {
            continue;
        }

        var index = parseInt(sourceKey, 10);
        if (String(index) === sourceKey && index >= 0) {
            result[index + 1] = source[sourceKey];
        } else {
            result[sourceKey] = source[sourceKey];
        }
    }

    return markOverflow(result, getMaxIndex(source) + 1);
};

var hexTable = (function () {
    var array = new Array(256);
    for (var i = 0; i < 256; ++i) {
        array[i] = '%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase();
    }

    return array;
}());

exports.arrayToObject = function (source, options) {
    var obj = options.plainObjects ? Object.create(null) : {};
    for (var i = 0; i < source.length; ++i) {
        if (typeof source[i] !== 'undefined') {
            obj[i] = source[i];
        }
    }

    return obj;
};

exports.merge = function (target, source, options) {
    if (!source) {
        return target;
    }

    var opts = options || {};

    if (typeof source !== 'object') {
        if (Array.isArray(target)) {
            target.push(source);
        } else if (typeof target === 'object') {
            if (isOverflow(target)) {
                appendOverflow(target, source);
            } else if (opts.plainObjects || opts.allowPrototypes || !has.call(Object.prototype, source)) {
                target[source] = true;
            }
        } else {
            return [target, source];
        }

        return target;
    }

    if (typeof target !== 'object') {
        if (isOverflow(source)) {
            return prependToOverflow(target, source, opts.plainObjects);
        }

        return [target].concat(source);
    }

    var mergeTarget = target;
    if (Array.isArray(target) && !Array.isArray(source)) {
        mergeTarget = exports.arrayToObject(target, options);
    }

    return Object.keys(source).reduce(function (acc, key) {
        var value = source[key];

        if (key === overflowKey && isOverflow(acc)) {
            // A key named like the marker arrived from the query string; it must
            // not clobber the internal marker, or `arrayLimit` accounting for
            // the rest of this key would be lost.
            return acc;
        }

        if (Object.prototype.hasOwnProperty.call(acc, key)) {
            acc[key] = exports.merge(acc[key], value, options);
        } else {
            acc[key] = value;
        }
        return acc;
    }, mergeTarget);
};

exports.decode = function (str) {
    try {
        return decodeURIComponent(str.replace(/\+/g, ' '));
    } catch (e) {
        return str;
    }
};

exports.encode = function (str) {
    // This code was originally written by Brian White (mscdex) for the io.js core querystring library.
    // It has been adapted here for stricter adherence to RFC 3986
    if (str.length === 0) {
        return str;
    }

    var string = typeof str === 'string' ? str : String(str);

    var out = '';
    for (var i = 0; i < string.length; ++i) {
        var c = string.charCodeAt(i);

        if (
            c === 0x2D || // -
            c === 0x2E || // .
            c === 0x5F || // _
            c === 0x7E || // ~
            (c >= 0x30 && c <= 0x39) || // 0-9
            (c >= 0x41 && c <= 0x5A) || // a-z
            (c >= 0x61 && c <= 0x7A) // A-Z
        ) {
            out += string.charAt(i);
            continue;
        }

        if (c < 0x80) {
            out = out + hexTable[c];
            continue;
        }

        if (c < 0x800) {
            out = out + (hexTable[0xC0 | (c >> 6)] + hexTable[0x80 | (c & 0x3F)]);
            continue;
        }

        if (c < 0xD800 || c >= 0xE000) {
            out = out + (hexTable[0xE0 | (c >> 12)] + hexTable[0x80 | ((c >> 6) & 0x3F)] + hexTable[0x80 | (c & 0x3F)]);
            continue;
        }

        i += 1;
        c = 0x10000 + (((c & 0x3FF) << 10) | (string.charCodeAt(i) & 0x3FF));
        out += hexTable[0xF0 | (c >> 18)] + hexTable[0x80 | ((c >> 12) & 0x3F)] + hexTable[0x80 | ((c >> 6) & 0x3F)] + hexTable[0x80 | (c & 0x3F)];
    }

    return out;
};

exports.compact = function (obj, references) {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    var refs = references || [];
    var lookup = refs.indexOf(obj);
    if (lookup !== -1) {
        return refs[lookup];
    }

    refs.push(obj);

    if (Array.isArray(obj)) {
        var compacted = [];

        for (var i = 0; i < obj.length; ++i) {
            if (obj[i] && typeof obj[i] === 'object') {
                compacted.push(exports.compact(obj[i], refs));
            } else if (typeof obj[i] !== 'undefined') {
                compacted.push(obj[i]);
            }
        }

        return compacted;
    }

    var keys = Object.keys(obj);
    for (var j = 0; j < keys.length; ++j) {
        var key = keys[j];
        obj[key] = exports.compact(obj[key], refs);
    }

    return obj;
};

exports.isRegExp = function (obj) {
    return Object.prototype.toString.call(obj) === '[object RegExp]';
};

exports.isBuffer = function (obj) {
    if (obj === null || typeof obj === 'undefined') {
        return false;
    }

    return !!(obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj));
};

exports.isOverflow = isOverflow;

exports.combine = function (a, b, arrayLimit, plainObjects) {
    if (isOverflow(a)) {
        return appendOverflow(a, b);
    }

    var result = [].concat(a, b);
    if (result.length > arrayLimit) {
        return markOverflow(exports.arrayToObject(result, { plainObjects: plainObjects }), result.length - 1);
    }

    return result;
};
