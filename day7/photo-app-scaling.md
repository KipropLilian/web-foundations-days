# Day 7 Assignment: Scaling a Photo-Sharing App

## 1. Goals and assumptions

The system must let users upload photos, browse feeds, and view images reliably as traffic grows. The design separates request handling from image processing and stores binary images in object storage rather than relational database rows.

For capacity planning, use the daily totals already calculated earlier in this assignment. Convert daily traffic to rates using 86,400 seconds per day, then apply the required 5× peak multiplier.

Let:
- `U` = number of photo uploads per day.
- `F` = number of feed views per day.
- `S` = average original photo size in MB.
- `T` = average thumbnail size in MB.

## 2. Architecture

```text
Mobile/Web Client
       |
       v
 CDN / Edge Cache ------------------------------+
       |                                        |
       v                                        |
 Load Balancer                                  |
       |                                        |
       v                                        |
 API Gateway                                    |
   |       |          |            |             |
   v       v          v            v             |
User    Feed       Upload       Photo Metadata   |
Service Service    Service      (Relational DB)  |
   |       |          |                         |
   |       |          v                         |
   |       |     Object Storage <----------------+
   |       |          |
   |       |          v
   |       |      Message Queue
   |       |          |
   |       |          v
   |       |     Thumbnail Workers
   |       |          |
   |       |          v
   |       +----> Thumbnail Object Storage
   |
   +----> User Database

Feed Service may use a cache and read replicas for high-volume reads.
```

### Component responsibilities

1. **CDN / edge cache:** Delivers cached images, thumbnails, static assets, and cacheable public content from locations closer to users. Cache misses go to the origin. Private images must use access-controlled URLs or signed URLs.
2. **Load balancer:** Distributes incoming requests across healthy API instances, performs health checks, and stops sending traffic to unhealthy instances.
3. **API gateway:** Provides a common entry point for routing, authentication enforcement, rate limiting, request validation, and request tracing. It should not perform expensive image transformations.
4. **User service:** Manages accounts, profiles, authentication-related data, and user permissions.
5. **Feed service:** Retrieves posts and feed metadata, applies visibility rules, and returns paginated feed results. It can use caching and read replicas for read-heavy workloads.
6. **Upload service:** Authorizes uploads, validates metadata and file limits, creates an upload record, and issues a short-lived pre-signed object-storage upload URL. The client can upload image bytes directly to object storage rather than sending large files through the API servers.
7. **Photo metadata database:** Stores structured records such as photo ID, owner ID, object key, content type, dimensions, processing status, timestamps, and visibility. It stores metadata, not the full binary image. Relational storage supports constraints and queries without making database backups and replication carry every image byte.
8. **Object storage:** Stores original images and generated thumbnails as durable objects. It supports high-capacity storage and object keys; lifecycle policies can move older originals to cheaper storage where appropriate.
9. **Message queue:** Receives a durable `PhotoUploaded` job/event after the original is stored and its metadata record is created. It buffers bursts and decouples upload requests from slower processing.
10. **Thumbnail workers:** Consume queued jobs, decode and validate the image, generate appropriately sized thumbnails and optimized formats, write them to object storage, and update processing status. Workers can scale horizontally based on queue depth.
11. **Cache / read replicas:** Reduce repeated feed and metadata reads. Cached data is not the authority for permissions or upload status; stale entries must expire or be invalidated.

## 3. Photo upload lifecycle

1. The client authenticates and asks the Upload Service to start an upload, sending metadata such as file name, content type, size, and an idempotency key.
2. The service validates the user, allowed format, maximum size, quota, and request. It creates a photo record with status `UPLOADING` and returns a short-lived pre-signed upload URL.
3. The client uploads the original image directly to object storage over HTTPS. The API servers do not need to proxy the full binary payload.
4. The client or object-storage event confirms that the upload completed. The service verifies the object exists and checks its size/type; where appropriate, it verifies a checksum and performs malware/content validation.
5. The service marks the photo as `PROCESSING` and publishes a durable `PhotoUploaded` message containing the photo ID and object key. The message should be published only after the object and metadata are safely recorded. A transactional outbox or retryable event publisher can prevent an event from being lost after a database commit.
6. The API returns promptly with the photo ID and a processing status. The user does not have to wait for thumbnail generation to finish before the upload request completes.
7. A thumbnail worker consumes the message, downloads the original, decodes it safely, applies orientation correction, and generates required thumbnail sizes and optimized formats.
8. The worker writes the thumbnails to object storage using deterministic keys so retries do not create uncontrolled duplicates. It updates metadata to `READY` and emits a completion event if needed.
9. The feed and photo APIs expose the photo according to product rules. Until thumbnails are ready, the UI can show a placeholder or the original where appropriate.
10. If processing fails, the message is retried with backoff. After the configured retry limit, it goes to a dead-letter queue for investigation. Idempotent workers make repeated delivery safe; monitoring tracks queue depth, oldest-message age, failures, and processing latency.

## 4. Traffic calculations: average and peak rates

There are 86,400 seconds in one day. The 5× multiplier is applied to the average rate to estimate peak demand.

### Upload requests

- Daily uploads: `U` uploads/day.
- Average upload rate: `U ÷ 86,400` uploads/second.
- Estimated peak upload rate: `(U ÷ 86,400) × 5` uploads/second.

### Feed views

- Daily feed views: `F` feed views/day.
- Average feed-view rate: `F ÷ 86,400` views/second.
- Estimated peak feed-view rate: `(F ÷ 86,400) × 5` views/second.

**Worked example (illustrative only):** If the planning assumptions are 200,000 uploads/day and 2,000,000 feed views/day:

| Traffic | Daily total | Average per second | Peak per second (5×) |
|---|---:|---:|---:|
| Uploads | 200,000 | 200,000 ÷ 86,400 = **2.31** | 2.31 × 5 = **11.57** |
| Feed views | 2,000,000 | 2,000,000 ÷ 86,400 = **23.15** | 23.15 × 5 = **115.74** |

Replace the illustrative daily totals in this table with the exact daily upload and feed-view totals calculated earlier in the assignment if they differ. Do not change the formulas. These are request-rate estimates; image bandwidth must also be estimated using object sizes and cache-hit ratios.

### Bandwidth implication

If an upload averages `S` MB, approximate peak original-image ingress is:

`Peak uploads/second × S MB × 8 = megabits/second (Mbps)`

This is a simplified estimate before protocol overhead and retries. For feed delivery, multiply feed image requests per second by average delivered image size, then account for CDN cache hits. A high CDN hit rate reduces origin bandwidth and object-storage reads.

## 5. Storage strategy

Store original images and generated thumbnails in object storage; store only searchable metadata and object keys in the relational database.

If `U` photos are uploaded per day, with average original size `S` MB and thumbnail size `T` MB:

- Daily new image storage = `U × (S + T)` MB/day.
- Annual new image storage = `U × (S + T) × 365` MB/year.

Use consistent units when converting MB to GB/TB. The estimate excludes replicas, backups, versioning, and temporary processing copies unless those are explicitly included. Apply lifecycle policies and retention rules, and monitor storage growth. Avoid storing binary blobs in relational tables because this increases database size, backup/restore time, replication traffic, and pressure on database I/O.

## 6. Architectural trade-offs

### Trade-off 1: Eventual consistency on feed reads vs. strongly consistent reads

Read replicas and caches reduce load on the primary database and improve feed response time, but replication lag or stale cache entries can mean a newly uploaded photo does not appear immediately.

**Decision:** Use replicas/caches for ordinary feed browsing and tolerate a short delay, with pagination and cache invalidation/short TTLs. Use the primary database for operations that require authoritative state, such as upload ownership, privacy changes, deletion, and permission checks. The UI can show `PROCESSING` until the photo is ready rather than promising immediate visibility.

### Trade-off 2: Pre-generating thumbnails vs. generating them on demand

Pre-generating thumbnails uses storage and background compute even for images that may rarely be viewed, but makes first views faster and avoids repeated transformations. Generating on demand saves storage for unpopular size variants but adds latency and compute at request time, especially during traffic spikes.

**Decision:** Pre-generate the common thumbnail sizes and formats asynchronously. Generate uncommon variants on demand only if usage data justifies it, and cache the result. Monitor thumbnail storage, worker cost, and cache-hit rate.

### Trade-off 3: Direct-to-object-storage uploads vs. proxying uploads through the API

Direct uploads reduce API bandwidth and server load, but require short-lived signed URLs, careful validation, and handling incomplete uploads. Proxying uploads is simpler to reason about initially but makes application servers handle large payloads and can increase latency and cost.

**Decision:** Use pre-signed direct uploads with short expiry, strict object-key scope, size/type validation, and server-side verification after upload.

### Trade-off 4: Asynchronous image processing vs. synchronous processing

Synchronous processing can make a photo immediately available in every size, but it increases request latency and makes API capacity depend on image-processing cost. Asynchronous processing improves responsiveness and absorbs bursts, but introduces queue delay, retries, and temporary `PROCESSING` states.

**Decision:** Process thumbnails asynchronously with idempotent workers, bounded retries, a dead-letter queue, and a clear processing status in the API.

## 7. Reliability, security, and monitoring

- Require authentication and check authorization for private photos on every relevant read.
- Use short-lived pre-signed URLs and avoid exposing permanent write permissions to clients.
- Validate file type, size, dimensions, and image decoding; do not trust the client-provided MIME type alone.
- Make upload creation and worker processing idempotent to handle retries.
- Use database transactions or an outbox pattern so metadata and processing events are not silently separated.
- Monitor request rate, p95/p99 latency, upload failures, object-storage errors, CDN cache-hit ratio, database CPU/connections, queue depth, oldest queued job, worker failure rate, and time from upload to `READY`.
- Alert on sustained queue growth, elevated 5xx responses, slow thumbnail generation, or abnormal storage growth.
- Test at the calculated 5× peak rates and include bursts, slow storage, duplicate queue messages, worker crashes, and retry scenarios.

## Conclusion

The system scales by keeping API services stateless where possible, serving image bytes from a CDN and object storage, and processing thumbnails asynchronously through a durable queue and horizontally scalable workers. Average and peak rates are calculated from daily totals using 86,400 seconds per day and the required 5× multiplier. The design deliberately accepts limited feed staleness and asynchronous processing in exchange for lower read latency and faster upload responses, while preserving authoritative permission checks and reliable processing.
