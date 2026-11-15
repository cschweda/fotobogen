// Fotobogen's settings, all in one place.
//
// How settings are decided, highest priority first:
//
//   1. Environment variables set when the app is started
//   2. The .env file beside this one (copy .env.sample to .env; never commit it)
//   3. The values in this file
//
// So a value here is a default. To change something on one server, put it
// in .env and leave this file alone; that survives updates. The name of the
// environment variable for each setting is given in its comment. Settings
// with no environment variable can only be changed here, and a change here
// needs `pnpm build` before it takes effect.

export default {
  // ══════════════════════════════════════════════════════════════════════
  //  OKAY TO CHANGE
  //  Safe to adjust for your server. Prefer .env over editing this file.
  // ══════════════════════════════════════════════════════════════════════

  server: {
    // The port the app listens on.                              .env: PORT
    // 5150 keeps clear of the ports other tools reach for first (3000,
    // 8000, 8080). If you leave the port at its default and it is busy,
    // Fotobogen tries the next one up (5151, 5152, ...). A port you set
    // yourself is used exactly, or the app stops and says it is taken.
    port: 5150,

    // How many ports above the default to try before giving up.
    portAttempts: 10,

    // The network address to listen on.                         .env: HOST
    // '0.0.0.0' accepts connections from other machines. Use '127.0.0.1'
    // when a proxy on the same machine (nginx, Caddy) is the only thing
    // that should reach the app.
    host: '0.0.0.0',

    // Set to true only when the app can be reached solely through your own
    // reverse proxy. It makes the login limit use the visitor's address
    // from X-Forwarded-For. The shipped Docker and pm2 files turn it on.
    //                                                    .env: TRUST_PROXY=1
    trustProxy: false,
  },

  // Where the site keeps everything it owns: database, photos, modules.
  // A relative path is relative to where the app is started.
  //                                                         .env: DATA_DIR
  dataDir: './data',

  uploads: {
    // The largest file accepted, in megabytes.            .env: MAX_UPLOAD_MB
    // If you raise it, raise your proxy's limit to match (max_size in
    // deploy/Caddyfile, client_max_body_size in nginx).
    maxUploadMb: 50,

    // The largest image accepted, in megapixels (width x height).
    //                                                   .env: MAX_MEGAPIXELS
    maxMegapixels: 100,
  },

  // ══════════════════════════════════════════════════════════════════════
  //  DO NOT TOUCH
  //  The rest of the app is built and tested around these values. Changing
  //  one can break existing sites, waste disk space, or run a small server
  //  out of memory. They are here so there is one place to read them, not
  //  as an invitation to tune them.
  // ══════════════════════════════════════════════════════════════════════

  internals: {
    // Sizes of the resized copies made of every photo, in pixels. Photos
    // already processed keep the sizes they were made at, so changing
    // these leaves a site with a mixture.
    derivatives: {
      thumbWidth: 480, // grid thumbnail: this wide, any height
      squareSize: 480, // square crop for the square grid
      mediumEdge: 1280, // long edge, for small screens
      largeEdge: 2560, // long edge, for large screens; also the working size
      webpQuality: { thumb: 78, square: 78, medium: 82, large: 82 },
      previewEdge: 1024, // unsaved previews in the admin
    },

    // Pixel limits, in megapixels, for formats that must be held whole in
    // memory to open. Measured so one photo stays under about 450 MB; see
    // docs/DESIGN.md section 7. Raising them can crash a 1 GB server.
    formatMegapixels: { 'avif': 16, 'webp': 60, 'interlaced png': 40 },

    // The largest picture a module's transform may produce, in megapixels.
    moduleOutputMegapixels: 40,

    queue: {
      // How many times a photo is tried before it is marked failed.
      maxAttempts: 3,
    },

    auth: {
      // How long a login lasts without being used, in days.
      sessionDays: 30,
      // Failed logins or setup-token attempts allowed per address...
      maxFailures: 5,
      // ...within this many minutes, before the address has to wait.
      failureWindowMinutes: 15,
      // Shortest password accepted. Also enforced in the browser.
      passwordMinLength: 12,
    },

    samples: {
      // Where the sample photos come from, and how long to wait for each.
      source: 'https://picsum.photos',
      timeoutSeconds: 20,
      // If this many in a row fail at the start, the service is treated as
      // unreachable and the download stops.
      giveUpAfter: 3,
    },

    // What a machine needs before Fotobogen will start (the preflight
    // check). Below `fail` the app refuses to run; below `warn` it runs
    // and says what to improve.
    requirements: {
      nodeMajor: 24,
      memoryMb: { fail: 900, warn: 1900 },
      freeDiskMb: { fail: 500, warn: 2000 },
      // Tested platforms. Others may work but are reported as untested.
      platforms: ['linux', 'darwin', 'win32'],
      architectures: ['x64', 'arm64'],
      linuxFamilies: ['debian', 'ubuntu'],
    },
  },
}
