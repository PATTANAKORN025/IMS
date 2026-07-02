/**
 * Boundary Testing — Data Quality Unit Tests
 * Tests that parser correctly handles out-of-range and garbage values
 */

const assert = require('assert');

// ============================================================
// Mock parser validation functions (extracted from Node-RED parser logic)
// ============================================================

function validateTemperature(val) {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (isNaN(num)) return null;
  if (num < -40 || num > 150) return null;
  return num;
}

function validateCpuPercent(val) {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (isNaN(num)) return null;
  if (num < 0 || num > 100) return null;
  return num;
}

function validateMemoryPercent(val) {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (isNaN(num)) return null;
  if (num < 0 || num > 100) return null;
  return num;
}

function validateDiskPercent(val) {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (isNaN(num)) return null;
  if (num < 0 || num > 100) return null;
  return num;
}

function validateMbps(val) {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (isNaN(num)) return null;
  if (num < 0 || num > 100000) return null;
  return num;
}

function validateLdiPE(val) {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (isNaN(num)) return null;
  if (num < -100 || num > 100) return null;
  return num;
}

function validateHumidity(val) {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (isNaN(num)) return null;
  if (num < 0 || num > 100) return null;
  return num;
}

function safeStr(val) {
  if (val === null || val === undefined) return 'unknown';
  return String(val).replace(/'/g, "''");
}

function safeNum(val) {
  const num = Number(val);
  if (isNaN(num)) return 0;
  return num;
}

// ============================================================
// Test Suite
// ============================================================

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name} — ${e.message}`);
  }
}

console.log("--- Temperature Boundary Tests ---");
test("Normal temp 25.5°C", () => assert.strictEqual(validateTemperature(25.5), 25.5));
test("Max realistic 85°C", () => assert.strictEqual(validateTemperature(85), 85));
test("Sensor malfunction 9999°C → null", () => assert.strictEqual(validateTemperature(9999), null));
test("Impossible negative -50°C → null", () => assert.strictEqual(validateTemperature(-50), null));
test("Overflow 65535 (snmpsim 16-bit) → valid", () => assert.strictEqual(validateTemperature(65535), null));
test("String garbage → null", () => assert.strictEqual(validateTemperature("abc"), null));
test("Null → null", () => assert.strictEqual(validateTemperature(null), null));
test("Undefined → null", () => assert.strictEqual(validateTemperature(undefined), null));

console.log("\n--- CPU/Memory/Disk Boundary Tests ---");
test("CPU 50% valid", () => assert.strictEqual(validateCpuPercent(50), 50));
test("CPU 100% valid", () => assert.strictEqual(validateCpuPercent(100), 100));
test("CPU 101% → null", () => assert.strictEqual(validateCpuPercent(101), null));
test("CPU -1% → null", () => assert.strictEqual(validateCpuPercent(-1), null));
test("RAM 99.9% valid", () => assert.strictEqual(validateMemoryPercent(99.9), 99.9));
test("RAM 200% → null", () => assert.strictEqual(validateMemoryPercent(200), null));
test("Disk 0% valid", () => assert.strictEqual(validateDiskPercent(0), 0));
test("Disk -0.1% → null", () => assert.strictEqual(validateDiskPercent(-0.1), null));

console.log("\n--- Network Mbps Boundary Tests ---");
test("1 Gbps valid", () => assert.strictEqual(validateMbps(1000), 1000));
test("10 Gbps valid", () => assert.strictEqual(validateMbps(10000), 10000));
test("100 Gbps valid (boundary)", () => assert.strictEqual(validateMbps(100000), 100000));
test("101 Gbps → null", () => assert.strictEqual(validateMbps(101000), null));
test("Negative Mbps → null", () => assert.strictEqual(validateMbps(-1), null));

console.log("\n--- LDI / Manufacturing Boundary Tests ---");
test("PE 5% valid", () => assert.strictEqual(validateLdiPE(5), 5));
test("PE 100% valid (boundary)", () => assert.strictEqual(validateLdiPE(100), 100));
test("PE 101% → null (out of range)", () => assert.strictEqual(validateLdiPE(101), null));
test("PE -101% → null", () => assert.strictEqual(validateLdiPE(-101), null));
test("Humidity 65% valid", () => assert.strictEqual(validateHumidity(65), 65));
test("Humidity 101% → null", () => assert.strictEqual(validateHumidity(101), null));

console.log("\n--- SQL Injection / String Safety Tests ---");
test("safeStr normal", () => assert.strictEqual(safeStr("E2E-SERVER-001"), "E2E-SERVER-001"));
test("safeStr with quote", () => assert.strictEqual(safeStr("O'Brien"), "O''Brien"));
test("safeStr null", () => assert.strictEqual(safeStr(null), "unknown"));
test("safeNum normal", () => assert.strictEqual(safeNum(42), 42));
test("safeNum string", () => assert.strictEqual(safeNum("abc"), 0));
test("safeNum null", () => assert.strictEqual(safeNum(null), 0));

console.log(`\n${"=".repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
