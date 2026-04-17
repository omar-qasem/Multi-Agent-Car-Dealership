#!/usr/bin/env node
/**
 * Generate a bcrypt hash for ADMIN_PASSWORD_HASH.
 *
 * Usage:
 *   node scripts/hash-admin-password.js "yourStrongPassword"
 *
 * Copy the printed hash into Netlify (or your .env) as ADMIN_PASSWORD_HASH.
 * NEVER commit the plaintext password. The hash is safe to commit IF you
 * rotate it on compromise.
 */

const bcrypt = require('bcryptjs');

const plaintext = process.argv[2];
if (!plaintext) {
    console.error('Usage: node scripts/hash-admin-password.js "yourStrongPassword"');
    process.exit(1);
}
if (plaintext.length < 12) {
    console.error('❌ Password must be at least 12 characters.');
    process.exit(1);
}

const rounds = 12;
const hash = bcrypt.hashSync(plaintext, rounds);
console.log('');
console.log('Add this to your environment (Netlify site → Build & deploy → Environment):');
console.log('');
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log('');
console.log('Then REMOVE any plaintext ADMIN_PASSWORD variable from the same environment.');
