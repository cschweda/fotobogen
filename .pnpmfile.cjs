// pnpm reads this file before it does anything else, which makes it the one
// place a check can stop `pnpm install` before a single package is fetched.
// (A "preinstall" script cannot: pnpm runs it after installing.)
//
// It checks that Node.js and pnpm are new enough, and explains what to do if
// not. It changes nothing about how packages are installed: no hooks.
'use strict'

// Not present in every place pnpm is run (the Docker build installs before
// the scripts folder is copied in, on a Node.js that is known to be right).
let check
try { check = require('./scripts/check-tools.cjs') }
catch (error) { check = null }

if (check) check.run()

module.exports = {}
