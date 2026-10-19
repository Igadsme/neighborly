# Storage Configuration

Milestone 4 adds real listing image storage. This document states what is
configured, what is **not**, and what production must supply.

## Architecture

Objects live in an S3-compatible bucket. The API is the only component that
holds credentials:

```
browser ──multipart──▶ POST /listings/:id/images
                              │  validate bytes (magic numbers)
                              │  PUT object (random key)
                              ▼
                    S3 / MinIO / rustfs  (private bucket)
                              │
browser ──GET──▶ GET /api/v1/media/listings/:id/file  (streams the object)
```

The browser never receives an access key, a secret, or a presigned URL. It
fetches images from the API's own media route, which streams the object and
sets `Cache-Control: public, max-age=31536000, immutable`.

The cache lifetime is safe because every upload gets a **random object key**.
Deleting and re-uploading a photo produces a new key, so a cached response can
never show a stale image.

## Content validation is not the declared type

`detectImageType` in `backend/src/storage/storage.service.ts` checks magic
numbers at fixed offsets. The bytes decide:

- JPEG `FF D8 FF`
- PNG `89 50 4E 47 0D 0A 1A 0A`
- WebP `RIFF....WEBP` (the `WEBP` tag at offset 8 is required, since `RIFF`
  alone is ambiguous)
- GIF `GIF87a` / `GIF89a`

If the caller declares a type that disagrees with the detected type, the
upload is rejected rather than trusted. A PNG signature followed by an `MZ`
header is refused. The stored object's `ContentType` is always the detected
type, never the client's claim.

Detection and acceptance are separate decisions: a valid GIF is refused under
the default `ALLOWED_IMAGE_TYPES` (`image/jpeg,image/png,image/webp`).

## Multipart is route-scoped

`allowMultipartForListingImages` accepts `multipart/form-data` **only** for
`POST /api/v1/listings/:uuid/images`. Every other route still returns 415, so
a file cannot be posted to an unrelated endpoint to bypass the JSON body
limits.

## Local verification

`scripts/run-storage-tests.sh` starts a disposable PostgreSQL and a disposable
S3-compatible object store, applies all migrations, runs both storage suites,
and removes both containers on exit. It never touches the development Compose
stack, the staging rustfs volume, or any production host.

```bash
./scripts/run-storage-tests.sh
```

**Object store image.** `scripts/run-storage-tests.sh`, the storage CI job, and the staging Compose profile all use `rustfs/rustfs:1.0.1`. `minio/minio` was withdrawn from Docker Hub, and `quay.io/minio` is not anonymously pullable. Do not point staging back at that pin. The storage layer speaks the S3 API (path-style, `us-east-1`).

## Configuration

| Variable | Purpose |
| --- | --- |
| `S3_ENDPOINT` | Object store endpoint. Its presence selects path-style addressing, which MinIO and rustfs require and real AWS does not. |
| `S3_BUCKET` | Bucket name. |
| `S3_REGION` | Region, default `us-east-1`. |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Credentials. Never returned to a caller. |
| `ALLOWED_IMAGE_TYPES` | Accepted content types, default `image/jpeg,image/png,image/webp`. |
| `MAX_UPLOAD_SIZE_MB` | Per-image cap, default 5, max 10. |

A partial S3 configuration is rejected at startup. With no S3 configuration at
all the API still runs: `GET /listings/storage-status` reports
`{ configured: false }`, the upload route returns a clear 400, and every other
listing feature works.

`docker-compose.yml` already defines a `minio` service and a `minio-init`
bucket creator under the `staging` profile, and `.env.staging` points at it.

## Production requirements

1. **A real bucket.** The bucket should be private. The media route reads
   through the API, so public bucket access is unnecessary. Objects are
   written with `ACL: public-read`; if the provider rejects per-object ACLs,
   that line must be removed and the bucket policy must stay private.
2. **Credentials from a secret manager**, not from a committed env file. The
   values in `docker-compose.yml` and `.env.staging` are local-development
   only.
3. **A CORS policy is not required** for this design, because the browser
   never calls the bucket directly.
4. **Lifecycle rules** to expire orphaned objects. The API deletes objects on
   image removal and listing deletion, but an interrupted upload or an
   out-of-band edit can still leave an orphan.

## Verification status

| Check | Status |
| --- | --- |
| Byte round-trip through a live S3-compatible store | Verified |
| Rejection of non-images, type mismatches, oversized and empty files | Verified |
| Persistence across a fresh service instance | Verified |
| Listing ownership on upload, reorder, and delete | Verified |
| Storage object deletion on image and listing removal | Verified |
| Image count cap and reorder integrity | Verified |
| Production bucket, provider ACL support, and lifecycle rules | **Not verified — no production storage is configured** |