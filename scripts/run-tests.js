#!/usr/bin/env node
/**
 * Run every tests/*.test.js file in its own process and aggregate results.
 *
 * Each test file is self-executing (IIFE that exits 0 on success, 1 on
 * failure), so this runner just spawns `node <file>` per file and checks
 * the exit code — it doesn't re-implement assertions or discovery beyond
 * that. Kept separate from any one test file so CI has a single command
 * (`npm test`) that covers the whole suite and fails loudly if any file
 * fails or a new test file is added but errors out before printing a
 * pass/fail line.
 *
 * Usage:
 *   node scripts/run-tests.js
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testsDir = path.join(__dirname, '..', 'tests');

const files = fs
    .readdirSync(testsDir)
    .filter(f => f.endsWith('.test.js'))
    .sort();

if (files.length === 0) {
    console.error(`No *.test.js files found in ${testsDir}`);
    process.exit(1);
}

console.log(`Running ${files.length} test file(s) from tests/\n`);

let failedFiles = 0;

for (const file of files) {
    const fullPath = path.join(testsDir, file);
    console.log(`\n▶ ${file}`);
    const result = spawnSync(process.execPath, [fullPath], {
        stdio: 'inherit',
        env: process.env,
    });

    if (result.error) {
        console.error(`✗ ${file} failed to start: ${result.error.message}`);
        failedFiles++;
        continue;
    }
    if (result.status !== 0) {
        console.error(`✗ ${file} exited with code ${result.status}`);
        failedFiles++;
    }
}

console.log('\n' + '='.repeat(50));
if (failedFiles > 0) {
    console.error(`${failedFiles}/${files.length} test file(s) FAILED`);
    process.exit(1);
}

console.log(`All ${files.length} test file(s) passed`);
process.exit(0);
