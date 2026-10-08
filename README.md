# iVerif Wiki

## Local verification

GitHub Actions is retired. After installing the locked dependencies locally, run `bash .local-jobs/verify.sh` for verification tests, source-data checks, Astro checks, site build, and built-route checks in order. `.local-jobs/jobs.json` lists this explicit job with scheduling disabled. No listener, daily job, or publication is activated.
