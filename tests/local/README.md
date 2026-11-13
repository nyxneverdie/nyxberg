# Local integration-test services

`fake-s3.mjs` is an intentionally minimal, in-memory loopback emulator. It does not check AWS request signatures, implement all S3 operations, or prove provider compatibility or access isolation at the storage layer. It must not be used outside the local integration test. The application independently verifies Git object IDs and checksums during the test.
