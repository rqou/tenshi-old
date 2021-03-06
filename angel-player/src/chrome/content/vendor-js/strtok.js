// A fast streaming parser library.

var assert = require('./assert');
var Buffer = require('buffer').Buffer;


/*!
 * Copyright by Oleg Efimov
 *
 * See license text in LICENSE file
 */
/* Very hacked by Kyle Zentner. */

// Require dependencies
//var Buffer = require('buffer').Buffer;
//var assert = require('assert');
//var strtok = require('strtok');

// Require class for int64 storing
var Int64 = require('./int64.js');


// Buffer for parse() to handle types that span more than one buffer
var SPANNING_BUF = new Buffer(1024);

// Possibly call flush()
var maybeFlush = function(b, o, len, flush) {
    if (o + len > b.length) {
        if (typeof(flush) !== 'function') {
            throw new Error(
                'Buffer out of space and no valid flush() function found'
            );
        }

        flush(b, o);

        return 0;
    }

    return o;
};

// Sentinel types

var DEFER = {};
exports.DEFER = DEFER;

var DONE = {};
exports.DONE = DONE;

// Primitive types

var UINT8 = {
    len : 1,
    get : function(buf, off) {
        return buf[off];
    },
    put : function(b, o, v, flush) {
        assert.equal(typeof o, 'number');
        assert.equal(typeof v, 'number');
        assert.ok(v >= 0 && v <= 0xff);
        assert.ok(o >= 0);
        assert.ok(this.len <= b.length);

        no = maybeFlush(b, o, this.len, flush);
        b[no] = v & 0xff;

        return (no - o) + this.len;
    }
};
exports.UINT8 = UINT8;

var UINT16_LE = {
    len : 2,
    get : function(buf, off) {
        return buf[off] | (buf[off + 1] << 8);
    },
    put : function(b, o, v, flush) {
        assert.equal(typeof o, 'number');
        assert.equal(typeof v, 'number');
        assert.ok(v >= 0 && v <= 0xffff);
        assert.ok(o >= 0);
        assert.ok(this.len <= b.length);

        no = maybeFlush(b, o, this.len, flush);
        b[no] = v & 0xff;
        b[no + 1] = (v >>> 8) & 0xff;

        return (no - o) + this.len;
    }
};
exports.UINT16_LE = UINT16_LE;

var UINT16_BE = {
    len : 2,
    get : function(buf, off) {
        return (buf[off] << 8) | buf[off + 1];
    },
    put : function(b, o, v, flush) {
        assert.equal(typeof o, 'number');
        assert.equal(typeof v, 'number');
        assert.ok(v >= 0 && v <= 0xffff);
        assert.ok(o >= 0);
        assert.ok(this.len <= b.length);

        no = maybeFlush(b, o, this.len, flush);
        b[no] = (v >>> 8) & 0xff;
        b[no + 1] = v & 0xff;

        return (no - o) + this.len;
    }
};
exports.UINT16_BE = UINT16_BE;

var UINT32_LE = {
    len : 4,
    get : function(buf, off) {
        // Shifting the MSB by 24 directly causes it to go negative if its
        // last bit is high, so we instead shift by 23 and multiply by 2.
        // Also, using binary OR to count the MSB if its last bit is high
        // causes the value to go negative. Use addition there.
        return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16)) +
               ((buf[off + 3] << 23) * 2);
    },
    put : function(b, o, v, flush) {
        assert.equal(typeof o, 'number');
        assert.equal(typeof v, 'number');
        assert.ok(v >= 0 && v <= 0xffffffff);
        assert.ok(o >= 0);
        assert.ok(this.len <= b.length);

        no = maybeFlush(b, o, this.len, flush);
        b[no] = v & 0xff;
        b[no + 1] = (v >>> 8) & 0xff;
        b[no + 2] = (v >>> 16) & 0xff;
        b[no + 3] = (v >>> 24) & 0xff;

        return (no - o) + this.len;
    }
};
exports.UINT32_LE = UINT32_LE;

var UINT32_BE = {
    len : 4,
    get : function(buf, off) {
        // See comments in UINT32_LE.get()
        return ((buf[off] << 23) * 2) +
               ((buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]);
    },
    put : function(b, o, v, flush) {
        assert.equal(typeof o, 'number');
        assert.equal(typeof v, 'number');
        assert.ok(v >= 0 && v <= 0xffffffff);
        assert.ok(o >= 0);
        assert.ok(this.len <= b.length);

        no = maybeFlush(b, o, this.len, flush);
        b[no] = (v >>> 24) & 0xff;
        b[no + 1] = (v >>> 16) & 0xff;
        b[no + 2] = (v >>> 8) & 0xff;
        b[no + 3] = v & 0xff;

        return (no - o) + this.len;
    }
};
exports.UINT32_BE = UINT32_BE;

var INT8 = {
    len : 1,
    get : function(buf, off)  {
        var v = UINT8.get(buf, off);
        return ((v & 0x80) === 0x80) ?
            (-128 + (v & 0x7f)) :
            v;
    },
    put : function(b, o, v, flush) {
        assert.equal(typeof o, 'number');
        assert.equal(typeof v, 'number');
        assert.ok(v >= -128 && v <= 127);
        assert.ok(o >= 0);
        assert.ok(this.len <= b.length);

        no = maybeFlush(b, o, this.len, flush);
        b[no] = v & 0xff;

        return (no - o) + this.len;
    }
};
exports.INT8 = INT8;

var INT16_BE = {
    len : 2,
    get : function(buf, off)  {
        var v = UINT16_BE.get(buf, off);
        return ((v & 0x8000) === 0x8000) ?
            (-32768 + (v & 0x7fff)) :
            v;
    },
    put : function(b, o, v, flush) {
        assert.equal(typeof o, 'number');
        assert.equal(typeof v, 'number');
        assert.ok(v >= -32768 && v <= 32767);
        assert.ok(o >= 0);
        assert.ok(this.len <= b.length);

        no = maybeFlush(b, o, this.len, flush);
        b[no] = ((v & 0xffff) >>> 8) & 0xff;
        b[no + 1] = v & 0xff;

        return (no - o) + this.len;
    }
};
exports.INT16_BE = INT16_BE;

var INT32_BE = {
    len : 4,
    get : function(buf, off)  {
        // We cannot check for 0x80000000 directly, as this always returns
        // false. Instead, check for the two's-compliment value, which
        // behaves as expected. Also, we cannot subtract our value all at
        // once, so do it in two steps to avoid sign busting.
        var v = UINT32_BE.get(buf, off);
        return ((v & 0x80000000) === -2147483648) ?
            ((v & 0x7fffffff) - 1073741824 - 1073741824) :
            v;
    },
    put : function(b, o, v, flush) {
        assert.equal(typeof o, 'number');
        assert.equal(typeof v, 'number');
        assert.ok(v >= -2147483648 && v <= 2147483647);
        assert.ok(o >= 0);
        assert.ok(this.len <= b.length);

        no = maybeFlush(b, o, this.len, flush);
        b[no] = (v >>> 24) & 0xff;
        b[no + 1] = (v >>> 16) & 0xff;
        b[no + 2] = (v >>> 8) & 0xff;
        b[no + 3] = v & 0xff;

        return (no - o) + this.len;
    }
};
exports.INT32_BE = INT32_BE;

// Complex types
//
// These types are intended to allow callers to re-use them by manipulating
// the 'len' and other properties directly.

var BufferType = function(l) {
    var self = this;

    self.len = l;

    self.get = function(buf, off) {
        return buf.slice(off, off + this.len);
    };
};
exports.BufferType = BufferType;

// Needs for UTF8 string splitting to fit buffer byte length
var maxBytesPerUtf8Symbol = 4;

var StringType = function(l, e) {
  var self = this;

  self.len = l;

  self.encoding = e;

  self.get = function(buf, off) {
      return buf.toString(this.encoding, off, off + this.len);
  };

  self.put = function(buf, off, string, flush) {
    assert.equal(typeof off, 'number');
    assert.equal(typeof string, 'string');
    // Removed for performance, too sanity
    assert.equal(this.len, Buffer.byteLength(string, 'utf-8'));

    var newOff = off;

    var stringPartCharLength = ~~(buf.length/maxBytesPerUtf8Symbol);
    assert.ok(stringPartCharLength > 0);
    var stringPart, stringPartLength;

    if (this.len <= buf.length) {
      newOff = maybeFlush(buf, newOff, this.len, flush);

      newOff += buf.write(string, newOff, this.len, this.encoding);
    } else {
      while (string.length > 0) {
        stringPart = string.substring(0, stringPartCharLength);
        stringPartLength = Buffer.byteLength(stringPart, 'utf-8');

        newOff = maybeFlush(buf, newOff, stringPartLength, flush);

        newOff += buf.write(stringPart, newOff, stringPartLength, this.encoding);

        string = string.substring(stringPartCharLength);
      }
    }

    return (newOff - off);
  };
};
exports.StringType = StringType;

// Parse a stream
var parse = function(s, cb) {
    // Type of data that we're to parse next; if DEFER, we're awaiting
    // an invocation of typeCallback
    var type = DEFER;

    // Data that we've seen but not yet processed / handed off to cb; first
    // valid byte to process is always bufs[0][bufOffset]
    var bufs = [];
    var bufsLen = 0;
    var bufOffset = 0;

    // Callback for FSM to tell us what type to expect next
    var typeCallback = function(t) {
        if (type !== DEFER) {
            throw new Error('refusing to overwrite non-DEFER type');
        }

        type = t;

        emitData();
    };

    // Process data that we have accumulated so far, emitting any type(s)
    // collected. This is the main parsing loop.
    //
    // Out strategy for handling buffers is to shift them off of the bufs[]
    // array until we have enough accumulated to account for type.len bytes.
    var emitData = function() {
        while (type !== DONE && type !== DEFER && bufsLen >= type.len) {
            var b = bufs[0];
            var bo = bufOffset;

            assert.ok(bufOffset >= 0 && bufOffset < b.length);

            if ((b.length - bufOffset) < type.len) {
                if (SPANNING_BUF.length < type.len) {
                    SPANNING_BUF = new Buffer(
                        Math.pow(2, Math.ceil(Math.log(type.len) / Math.log(2)))
                    );
                }

                b = SPANNING_BUF;
                bo = 0;

                var bytesCopied = 0;
                while (bytesCopied < type.len && bufs.length > 0) {
                    var bb = bufs[0];

                    // TODO: Manually copy bytes if we don't need many of them.
                    //       Bouncing down into C++ land to invoke
                    //       Buffer.copy() is expensive enough that we
                    //       shouldnt' do it unless we have a lot of dato to
                    //       copy.
                    var copied = Math.min(type.len - bytesCopied, bb.length - bufOffset);
                    bb.copy(
                        b,
                        bytesCopied,
                        bufOffset,
                        bufOffset + copied
                    );

                    bytesCopied += copied;

                    if (copied < (bb.length - bufOffset)) {
                        assert.equal(bytesCopied, type.len);
                        bufOffset += copied;
                    } else {
                        assert.equal(bufOffset + copied, bb.length);
                        bufs.shift();
                        bufOffset = 0;
                    }
                }

                assert.equal(bytesCopied, type.len);
            } else if ((b.length - bufOffset) === type.len) {
                bufs.shift();
                bufOffset = 0;
            } else {
                bufOffset += type.len;
            }

            bufsLen -= type.len;
            type = cb(type.get(b, bo), typeCallback);
        }

        if (type === DONE) {
            s.removeListener('data', dataListener);

            // Pump all of the buffers that we already saw back through the
            // stream; the protocol layer will have set up listeners for this
            // event if it cares about the remaining data.
            while (bufs.length > 0) {
                var b = bufs.shift();

                if (bufOffset > 0) {
                    b = b.slice(bufOffset, b.length);
                    bufOffset = 0;
                }

                s.emit('data', b);
            }
        }
    };

    // Listen for data from our stream
    var dataListener = function(d) {
        bufs.push(d);
        bufsLen += d.length;

        emitData();
    };

    // Get the initial type
    type = cb(undefined, typeCallback);
    if (type !== DONE) {
        s.on('data', dataListener);
    }
};


// Internal function, copypasted from `strtok`
var maybeFlush = function(b, o, len, flush) {
  if (o + len > b.length) {
    if (typeof(flush) !== 'function') {
      throw new Error(
        'Buffer out of space and no valid flush() function found'
      );
    }

    flush(b, o);

    return 0;
  }

  return o;
};

// Extend `strtok` for reading/writing float and double numbers
exports.FLOAT_BE = {
    len : 4,
    get : function(buf, off) {
      return buf.readFloatBE(off);
    },
    put : function(b, o, v, flush) {
      assert.equal(typeof o, 'number');
      assert.equal(typeof v, 'number');
      var absV = Math.abs(v);
      assert.ok(1.18e-38 < absV && absV < 3.40e38);
      assert.ok(o >= 0);
      assert.ok(this.len <= b.length);

      var no = maybeFlush(b, o, this.len, flush);
      b.writeFloatBE(v, o);

      return (no - o) + this.len;
    }
};
exports.DOUBLE_BE = {
    len : 8,
    get : function(buf, off) {
      return buf.readDoubleBE(off);
    },
    put : function(b, o, v, flush) {
      assert.equal(typeof o, 'number');
      assert.equal(typeof v, 'number');
      var absV = Math.abs(v);
      assert.ok(2.23e-308 < absV && absV < 1.79e308);
      assert.ok(o >= 0);
      assert.ok(this.len <= b.length);

      var no = maybeFlush(b, o, this.len, flush);
      b.writeDoubleBE(v, o);

      return (no - o) + this.len;
    }
};

// Extend `strtok` for reading/writing int64 numbers as int32 pairs
exports.INT64_BE = {
    len : 8,
    get : function(buf, off) {
      // BE!
      return new Int64(
        buf.readInt32BE(off + this.len/2),
        buf.readInt32BE(off)
      );
    },
    put : function(b, o, v, flush) {
      assert.equal(typeof o, 'number');
      assert.ok(v instanceof Int64);
      v = v.toArrayPair();
      assert.equal(v.length, 2);
      assert.equal(typeof v[0], 'number');
      assert.equal(typeof v[1], 'number');
      assert.ok(v[0] >= -2147483648 && v[0] <= 2147483647);
      assert.ok(v[1] >= -2147483648 && v[1] <= 2147483647);
      assert.ok(o >= 0);
      assert.ok(this.len <= b.length);

      var no = maybeFlush(b, o, this.len, flush);
      // BE!
      b.writeInt32BE(v[1], o);
      b.writeInt32BE(v[0], o + this.len/2);

      return (no - o) + this.len;
    }
};

exports.parse = parse;
