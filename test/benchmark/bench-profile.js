// Default to nacl-fast.min.js if not specified
if (!process.env.NACL_SRC) {
  process.env.NACL_SRC = 'nacl-fast.min.js';
}

var nacl = (typeof window !== 'undefined') ? window.nacl : require('../../' + (process.env.NACL_SRC || 'nacl.min.js'));
var helpers = (typeof require !== 'undefined') ? require('./helpers') : window.helpers;
var log = helpers.log;

if (!nacl) throw new Error('nacl not loaded');

// Print benchmark environment info
log.print("\nProfiling enabled. Run with detailed data collection.");
log.print("Using library: " + process.env.NACL_SRC + "\n");

// Add profiling counters
var profiling = {
  functionCalls: {},
  detailedTiming: {},
  memoryUsage: []
};

// Function to record function calls
function countCall(fnName) {
  if (!profiling.functionCalls[fnName]) {
    profiling.functionCalls[fnName] = 0;
  }
  profiling.functionCalls[fnName]++;
}

// Function to time operations
function timeOperation(fnName, fn) {
  if (!profiling.detailedTiming[fnName]) {
    profiling.detailedTiming[fnName] = {
      totalTime: 0,
      calls: 0,
      minTime: Infinity,
      maxTime: 0
    };
  }
  
  var start = getTime();
  var result = fn();
  var elapsed = getTime() - start;
  
  profiling.detailedTiming[fnName].totalTime += elapsed;
  profiling.detailedTiming[fnName].calls++;
  profiling.detailedTiming[fnName].minTime = Math.min(profiling.detailedTiming[fnName].minTime, elapsed);
  profiling.detailedTiming[fnName].maxTime = Math.max(profiling.detailedTiming[fnName].maxTime, elapsed);
  
  return result;
}

// Record memory usage (Node.js only)
function recordMemoryUsage(label) {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    var mem = process.memoryUsage();
    profiling.memoryUsage.push({
      label: label,
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
      timestamp: Date.now()
    });
  }
}

// Function to print profiling info
function printProfilingInfo() {
  log.print("\n--------- DETAILED PROFILING INFORMATION ---------");
  
  // Print memory usage (Node.js only)
  if (profiling.memoryUsage.length > 0) {
    log.print("\n=== MEMORY USAGE ===");
    profiling.memoryUsage.forEach(function(mem) {
      log.print(mem.label + ":");
      log.print("  RSS: " + (mem.rss / 1024 / 1024).toFixed(2) + " MB");
      log.print("  Heap Total: " + (mem.heapTotal / 1024 / 1024).toFixed(2) + " MB");
      log.print("  Heap Used: " + (mem.heapUsed / 1024 / 1024).toFixed(2) + " MB");
    });
  }
  
  // Print function call counts
  log.print("\n=== FUNCTION CALL COUNTS ===");
  Object.keys(profiling.functionCalls).sort((a, b) => {
    return profiling.functionCalls[b] - profiling.functionCalls[a];
  }).forEach(function(fnName) {
    log.print(pad(fnName, 30, true) + ": " + profiling.functionCalls[fnName] + " calls");
  });
  
  // Print detailed timing
  log.print("\n=== DETAILED TIMING ===");
  Object.keys(profiling.detailedTiming).sort((a, b) => {
    return profiling.detailedTiming[b].totalTime - profiling.detailedTiming[a].totalTime;
  }).forEach(function(fnName) {
    var timing = profiling.detailedTiming[fnName];
    var avgTime = timing.totalTime / timing.calls;
    log.print(pad(fnName, 30, true) + ": " +
              pad(timing.calls + " calls", 15) +
              pad(avgTime.toFixed(3) + " ms avg", 15) +
              pad(timing.minTime.toFixed(3) + " ms min", 15) +
              pad(timing.maxTime.toFixed(3) + " ms max", 15) +
              pad(timing.totalTime.toFixed(3) + " ms total", 15));
  });
  
  log.print("\n--------- END PROFILING INFORMATION ---------\n");
}

function decodeUTF8(s) {
  var i, d = unescape(encodeURIComponent(s)), b = new Uint8Array(d.length);
  for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
  return b;
}

var getTime = (function() {
  if (typeof performance !== 'undefined') {
    return performance.now.bind(performance);
  }
  if (typeof process !== 'undefined' && process.hrtime) {
    return function() {
      var _a = process.hrtime(), sec = _a[0], nanosec = _a[1];
      return (sec * 1e9 + nanosec) / 1e6;
    };
  }
  return Date.now.bind(Date);
})();

function benchmark(fn, bytes) {
  var elapsed = 0;
  var iterations = 1;
  var runsPerIteration = 1;
  // Run once without measuring anything to possibly kick-off JIT.
  fn();
  while (true) { // eslint-disable-line
    var startTime = void 0;
    var diff = void 0;
    if (runsPerIteration === 1) {
      // Measure one iteration.
      startTime = getTime();
      fn();
      diff = getTime() - startTime;
    } else {
      // Measure many iterations.
      startTime = getTime();
      for (var i = 0; i < runsPerIteration; i++) {
        fn();
      }
      diff = getTime() - startTime;
    }
    // If diff is too small, double the number of iterations
    // and start over without recording results.
    if (diff < 1) {
      runsPerIteration *= 2;
      continue;
    }
    // Otherwise, record the result.
    elapsed += diff;
    if (elapsed > 500 && iterations > 2) {
      break;
    }
    iterations += runsPerIteration;
  }
  // Calculate average time per iteration.
  var avg = elapsed / iterations;
  return {
    iterations: iterations,
    msPerOp: avg,
    opsPerSecond: 1000 / avg,
    bytesPerSecond: bytes ? 1000 * (bytes * iterations) / (avg * iterations) : undefined
  };
}

function pad(s, upto, end) {
  if (end === void 0) { end = false; }
  var padlen = upto - s.length;
  if (padlen <= 0) {
    return s;
  }
  // XXX: in ES2015 we can use ' '.repeat(padlen)
  var padding = new Array(padlen + 1).join(' ');
  if (end) {
    return s + padding;
  }
  return padding + s;
}

function report(name, results) {
  var ops = results.iterations + ' ops';
  var msPerOp = results.msPerOp.toFixed(2) + ' ms/op';
  var opsPerSecond = results.opsPerSecond.toFixed(2) + ' ops/sec';
  var mibPerSecond = results.bytesPerSecond
      ? (results.bytesPerSecond / 1024 / 1024).toFixed(2) + ' MiB/s'
      : '';
  log.print(
    pad(name, 25, true) + ' ' +
    pad(ops, 20) + ' ' +
    pad(msPerOp, 20) + ' ' +
    pad(opsPerSecond, 20) + ' ' +
    pad(mibPerSecond, 15)
  );
}

function crypto_stream_xor_benchmark() {
  recordMemoryUsage("Before crypto_stream_xor");
  var m = new Uint8Array(1024),
      n = new Uint8Array(24),
      k = new Uint8Array(32),
      out = new Uint8Array(1024),
      i;
  for (i = 0; i < 1024; i++) m[i] = i & 255;
  for (i = 0; i < 24; i++) n[i] = i;
  for (i = 0; i < 32; i++) k[i] = i;
  
  report('crypto_stream_xor 1K', benchmark(function() {
    countCall('crypto_stream_xor');
    timeOperation('crypto_stream_xor', function() {
      nacl.lowlevel.crypto_stream_xor(out, 0, m, 0, m.length, n, k);
    });
  }, m.length));
  
  recordMemoryUsage("After crypto_stream_xor");
}

function crypto_onetimeauth_benchmark() {
  recordMemoryUsage("Before crypto_onetimeauth");
  var m = new Uint8Array(1024),
      out = new Uint8Array(1024),
      k = new Uint8Array([0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1]);
  for (var i = 0; i < 1024; i++) {
    m[i] = i & 255;
  }
  
  report('crypto_onetimeauth 1K', benchmark(function() {
    countCall('crypto_onetimeauth');
    timeOperation('crypto_onetimeauth', function() {
      nacl.lowlevel.crypto_onetimeauth(out, 0, m, 0, m.length, k);
    });
  }, m.length));
  
  recordMemoryUsage("After crypto_onetimeauth");
}

function crypto_secretbox_benchmark() {
  recordMemoryUsage("Before crypto_secretbox");
  var i, k = new Uint8Array(32), n = new Uint8Array(24),
      m = new Uint8Array(1024), c = new Uint8Array(1024);
  for (i = 0; i < 32; i++) k[i] = 1;
  for (i = 0; i < 24; i++) n[i] = 2;
  for (i = 0; i < 1024; i++) m[i] = 3;
  
  report('crypto_secretbox 1K', benchmark(function() {
    countCall('crypto_secretbox');
    timeOperation('crypto_secretbox', function() {
      nacl.lowlevel.crypto_secretbox(c, m, m.length, n, k);
    });
  }, m.length));
  
  recordMemoryUsage("After crypto_secretbox");
}

function secretbox_seal_open_benchmark() {
  recordMemoryUsage("Before secretbox");
  var key = new Uint8Array(32),
      nonce = new Uint8Array(24),
      msg = new Uint8Array(1024),
      box, i;
  for (i = 0; i < 32; i++) key[i] = 1;
  for (i = 0; i < 24; i++) nonce[i] = 2;
  for (i = 0; i < 1024; i++) msg[i] = 3;

  report('secretbox 1K', benchmark(function() {
    countCall('secretbox');
    box = timeOperation('secretbox', function() {
      return nacl.secretbox(msg, nonce, key);
    });
  }, msg.length));
  recordMemoryUsage("After secretbox");

  recordMemoryUsage("Before secretbox.open");
  report('secretbox.open 1K', benchmark(function() {
    countCall('secretbox.open');
    timeOperation('secretbox.open', function() {
      nacl.secretbox.open(box, nonce, key);
    });
  }, msg.length));
  recordMemoryUsage("After secretbox.open");
}

function crypto_scalarmult_base_benchmark() {
  recordMemoryUsage("Before crypto_scalarmult_base");
  var n = new Uint8Array(32), q = new Uint8Array(32);
  for (var i = 0; i < 32; i++) n[i] = i;
  
  report('crypto_scalarmult_base', benchmark(function() {
    countCall('crypto_scalarmult_base');
    timeOperation('crypto_scalarmult_base', function() {
      nacl.lowlevel.crypto_scalarmult_base(q, n);
    });
  }));
  
  recordMemoryUsage("After crypto_scalarmult_base");
}

function box_seal_open_benchmark() {
  recordMemoryUsage("Before box");
  var pk1 = new Uint8Array(32), sk1 = new Uint8Array(32),
      pk2 = new Uint8Array(32), sk2 = new Uint8Array(32);
  nacl.lowlevel.crypto_box_keypair(pk1, sk1);
  nacl.lowlevel.crypto_box_keypair(pk2, sk2);
  var nonce = decodeUTF8('123456789012345678901234');
  var msg = decodeUTF8((new Array(1024)).join('a'));
  var box = null;

  report('box 1K', benchmark(function() {
    countCall('box');
    box = timeOperation('box', function() {
      return nacl.box(msg, nonce, pk1, sk2);
    });
  }, msg.length));
  recordMemoryUsage("After box");

  recordMemoryUsage("Before box.open");
  report('box.open 1K', benchmark(function() {
    countCall('box.open');
    timeOperation('box.open', function() {
      nacl.box.open(box, nonce, pk2, sk1);
    });
  }, msg.length));
  recordMemoryUsage("After box.open");
}

function sign_open_benchmark() {
  recordMemoryUsage("Before sign");
  var k = nacl.sign.keyPair();
  var sk = k.secretKey;
  var pk = k.publicKey;
  var msg = decodeUTF8((new Array(128)).join('a'));
  var sm;

  report('sign', benchmark(function() {
    countCall('sign');
    sm = timeOperation('sign', function() {
      return nacl.sign(msg, sk);
    });
  }));
  recordMemoryUsage("After sign");

  recordMemoryUsage("Before sign.open");
  report('sign.open', benchmark(function() {
    countCall('sign.open');
    timeOperation('sign.open', function() {
      nacl.sign.open(sm, pk);
    });
  }));
  recordMemoryUsage("After sign.open");
}

function crypto_hash_benchmark() {
  recordMemoryUsage("Before crypto_hash_1K");
  var m = new Uint8Array(1024), out = new Uint8Array(64);
  var i;
  for (i = 0; i < m.length; i++) m[i] = i & 255;
  
  report('crypto_hash 1K', benchmark(function() {
    countCall('crypto_hash_1K');
    timeOperation('crypto_hash_1K', function() {
      nacl.lowlevel.crypto_hash(out, m, m.length);
    });
  }, m.length));
  recordMemoryUsage("After crypto_hash_1K");

  recordMemoryUsage("Before crypto_hash_16K");
  m = new Uint8Array(16*1024);
  for (i = 0; i < m.length; i++) m[i] = i & 255;
  
  report('crypto_hash 16K', benchmark(function() {
    countCall('crypto_hash_16K');
    timeOperation('crypto_hash_16K', function() {
      nacl.lowlevel.crypto_hash(out, m, m.length);
    });
  }, m.length));
  recordMemoryUsage("After crypto_hash_16K");
}

// Special detailed profiling for core_salsa20 to understand hotspots
function detailed_crypto_core_salsa20_benchmark() {
  // Check if the function is available (might not be in minified version)
  if (!nacl.lowlevel.crypto_core_salsa20) {
    log.print("\n--- DETAILED SALSA20 CORE PROFILING ---");
    log.print("crypto_core_salsa20 function not directly accessible in minified version");
    log.print("--- END DETAILED SALSA20 CORE PROFILING ---\n");
    return;
  }
  
  log.print("\n--- DETAILED SALSA20 CORE PROFILING ---");
  
  var iterations = 10000;
  var m = new Uint8Array(64), // Output
      n = new Uint8Array(16), // Input
      k = new Uint8Array(32), // Key
      c = new Uint8Array(16); // Constants
  
  for (var i = 0; i < 16; i++) {
    n[i] = i;
    c[i] = i + 100;
  }
  for (i = 0; i < 32; i++) k[i] = i + 50;
  
  // Time the whole function
  var startTotal = getTime();
  for (i = 0; i < iterations; i++) {
    nacl.lowlevel.crypto_core_salsa20(m, n, k, c);
  }
  var totalTime = getTime() - startTotal;
  
  log.print("Total time for " + iterations + " iterations: " + totalTime.toFixed(2) + "ms");
  log.print("Average time per call: " + (totalTime / iterations).toFixed(4) + "ms");
  
  // Check if hsalsa20 is available 
  if (nacl.lowlevel.crypto_core_hsalsa20) {
    // Add timing for other crypto cores for comparison
    startTotal = getTime();
    for (i = 0; i < iterations; i++) {
      nacl.lowlevel.crypto_core_hsalsa20(m, n, k, c);
    }
    totalTime = getTime() - startTotal;
    
    log.print("HSalsa20 time for " + iterations + " iterations: " + totalTime.toFixed(2) + "ms");
    log.print("HSalsa20 average time per call: " + (totalTime / iterations).toFixed(4) + "ms");
  }
  
  log.print("--- END DETAILED SALSA20 CORE PROFILING ---\n");
}

// Advanced profiling: analyze memory usage patterns
function analyze_memory_patterns() {
  log.print("\n--- MEMORY USAGE PATTERN ANALYSIS ---");
  
  // Track memory before and after multiple iterations
  var iterations = [10, 100, 1000];
  var testSizes = [1024, 16*1024, 64*1024];
  
  iterations.forEach(function(iteration) {
    testSizes.forEach(function(size) {
      log.print("\nTesting with " + iteration + " iterations and " + size + " bytes:");
      
      var m = new Uint8Array(size);
      var out = new Uint8Array(64);
      for (var i = 0; i < size; i++) m[i] = i & 255;
      
      var memBefore = process.memoryUsage();
      log.print("  Before - HeapUsed: " + (memBefore.heapUsed / 1024 / 1024).toFixed(2) + " MB");
      
      // Run the test
      for (var j = 0; j < iteration; j++) {
        nacl.lowlevel.crypto_hash(out, m, m.length);
      }
      
      var memAfter = process.memoryUsage();
      log.print("  After  - HeapUsed: " + (memAfter.heapUsed / 1024 / 1024).toFixed(2) + " MB");
      log.print("  Delta: " + ((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024).toFixed(2) + " MB");
    });
  });
  
  log.print("--- END MEMORY USAGE PATTERN ANALYSIS ---\n");
}

// Add CPU profiling summary if running in Node.js with perf_hooks
function analyze_cpu_usage() {
  log.print("\n--- CPU USAGE ANALYSIS ---");
  
  try {
    // Check if we have access to performance hooks
    var perf_hooks = require('perf_hooks');
    if (perf_hooks && perf_hooks.performance && perf_hooks.performance.nodeTiming) {
      var timing = perf_hooks.performance.nodeTiming;
      log.print("Node.js Timing Metrics:");
      log.print("  Bootstrap: " + timing.bootstrapComplete.toFixed(2) + "ms");
      log.print("  Loop Start: " + timing.loopStart.toFixed(2) + "ms");
      log.print("  Loop Exit: " + (timing.loopExit || 0).toFixed(2) + "ms");
      
      // Get process info
      var os = require('os');
      log.print("\nSystem Information:");
      log.print("  CPU Count: " + os.cpus().length);
      log.print("  CPU Model: " + os.cpus()[0].model);
      log.print("  CPU Speed: " + os.cpus()[0].speed + " MHz");
      log.print("  Total Memory: " + (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + " GB");
      log.print("  Free Memory: " + (os.freemem() / 1024 / 1024 / 1024).toFixed(2) + " GB");
      log.print("  Load Average: " + os.loadavg().join(", "));
    } else {
      log.print("Performance hooks not available in this Node.js version");
    }
  } catch (e) {
    log.print("CPU profiling not available: " + e.message);
  }
  
  log.print("--- END CPU USAGE ANALYSIS ---\n");
}

recordMemoryUsage("Initial baseline");

// Run standard benchmarks
crypto_stream_xor_benchmark();
crypto_onetimeauth_benchmark();
crypto_secretbox_benchmark();
crypto_hash_benchmark();
secretbox_seal_open_benchmark();
crypto_scalarmult_base_benchmark();
box_seal_open_benchmark();
sign_open_benchmark();

// Run advanced profiling
detailed_crypto_core_salsa20_benchmark();
analyze_memory_patterns();
analyze_cpu_usage();

// Print detailed profiling information at the end
printProfilingInfo(); 