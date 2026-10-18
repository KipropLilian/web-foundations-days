
# SnapShare: Photo App Scaling Design

## 1. Context and Requirements

SnapShare is a photo-sharing application where users upload photos, view feeds, follow other users, and interact with posts. The system must support high traffic, store large volumes of images, and deliver feeds quickly during peak periods.

### Functional Requirements

- Users can upload photos and add captions.
- Users can follow other users and view their feeds.
- Users can like and comment on photos.
- Users can view photos and thumbnails.
- Users can retrieve their own photos and profile information.

### Non-Functional Requirements

- **Scalability:** Handle increasing numbers of users, uploads, and feed requests.
- **Availability:** Keep core functionality available when individual components fail.
- **Performance:** Load feeds and thumbnails quickly.
- **Durability:** Prevent uploaded photos from being lost.
- **Security:** Authenticate users and authorize access to private content.

## 2. Traffic and Storage Estimates

The following estimates are planning assumptions rather than measured production data.

### Assumptions

- Registered users: 10 million.
- Daily active users (DAU): 1 million.
- Feed items viewed per active user per day: 50.
- Photo uploads per active user per day: 1.
- Average original photo size: 2 MB.
- Average thumbnail size: 0.05 MB.
- Days per year: 365.

### Daily Traffic

**Feed requests**

1,000,000 daily active users × 50 feed items per day = 50 million feed-item views per day.

**Photo uploads**

1,000,000 daily active users × 1 upload per day = 1 million uploads per day.

**Read-to-upload ratio**

50 million feed-item views ÷ 1 million uploads = 50:1.

The application is read-heavy: feed viewing generates approximately 50 times as many item views as there are daily uploads. The architecture should therefore scale feed delivery independently from photo uploads.

### Storage Estimates

**Original photos**

1,000,000 uploads/day × 2 MB × 365 days = 730,000,000 MB, or approximately 730 TB per year using decimal storage units.

**Thumbnails**

1,000,000 uploads/day × 0.05 MB × 365 days = 18,250,000 MB, or approximately 18.25 TB per year.

**Total new image storage**

730 TB + 18.25 TB = **748.25 TB per year**, approximately 748 TB.

This estimate excludes database records, replicas, backups, temporary files, and additional image sizes. Actual storage requirements will depend on retention policies, compression, and upload growth.

Binary image files should be stored in object storage rather than directly in relational database rows. The database stores photo metadata and object keys, while object storage handles the large files.

## 3. High-Level Architecture

```text
                  Mobile App / Web Client
                            |
                            v
                     CDN / Edge Cache
                            |
                            v
                      Load Balancer
                            |
                            v
                       API Gateway
                            |
              +-------------+-------------+
              |             |             |
              v             v             v
         User Service   Feed Service   Upload Service
              |             |             |
              v             v             v
         User Database  Feed Cache    Object Storage
                            |          (Original Photos)
                            v                 |
                      Read Replicas           v
                                       Message Queue
                                              |
                                              v
                                      Background Workers
                                              |
                                              v
                                      Thumbnail Storage
                                              |
                                              v
                                         CDN Cache
```

### Component Descriptions

**1. Client applications**

Mobile and web clients allow users to upload photos, browse feeds, and interact with posts. Clients communicate with backend services through authenticated API requests.

**2. CDN and edge cache**

A Content Delivery Network (CDN) caches public or appropriately authorized image content near users. It reduces repeated requests to the origin storage and lowers image-loading latency. Private images require suitable authorization and cache controls.

**3. Load balancer**

The load balancer distributes incoming requests across healthy application instances. Multiple instances allow the system to handle more traffic and continue operating when an instance fails.

**4. API gateway**

The gateway provides a common entry point for backend APIs. It can enforce authentication, rate limits, request validation, and routing to the correct service.

**5. User service**

The user service manages profiles, account details, and follow relationships. It reads and writes user-related records in the database.

**6. Feed service**

The feed service retrieves posts relevant to a user, applies visibility and ranking rules, and returns paginated feed results. A cache can store frequently requested feed data to reduce repeated database queries.

**7. Upload service**

The upload service authenticates the user, validates upload requests, and coordinates photo storage and metadata creation. It can issue a time-limited presigned upload URL so the client uploads large image files directly to object storage.

**8. Relational database and read replicas**

The primary database stores structured information such as users, posts, captions, likes, comments, and object keys. Read replicas serve eligible read queries and reduce pressure on the primary database.

**9. Object storage**

Object storage holds original photos and generated thumbnails. It is designed for durable, scalable storage of large binary files and avoids placing image data directly in database rows.

**10. Message queue**

The queue stores background-processing jobs, such as generating thumbnails. It separates upload requests from slower processing tasks and allows workers to process jobs asynchronously.

**11. Background workers**

Workers consume queued jobs, generate appropriately sized thumbnails, and save the results to object storage. More workers can be added when the queue grows.

**12. Monitoring and logging**

Monitoring tracks API latency, error rates, upload failures, queue depth, worker processing time, storage usage, and database performance. Alerts help the team detect and resolve problems before they significantly affect users.

## 4. Step-by-Step Photo Upload Flow

1. **User initiates an upload.** The client sends an authenticated request to the upload service with the photo's metadata, such as its caption and file type.

2. **Request validation.** The upload service verifies the user's identity, checks permissions, validates the file type and size, and applies upload limits.

3. **Upload authorization.** The service creates an upload record with a pending status and returns a short-lived presigned URL for the original photo.

4. **Direct file upload.** The client uploads the image directly to object storage using the presigned URL. This avoids sending large image data through the application server and reduces server bandwidth.

5. **Upload confirmation.** The client or storage event confirms completion. The backend verifies that the object exists and updates the upload record to reflect that the original has been stored.

6. **Queue a processing job.** The backend publishes a message containing the photo ID and object key to the message queue. The message instructs a worker to generate thumbnails.

7. **Background processing.** A worker retrieves the message, downloads or reads the original photo, generates the required thumbnail sizes, and stores them in object storage.

8. **Update photo status.** The worker records the thumbnail object keys and marks processing as complete. Failed jobs can be retried, with dead-letter handling for jobs that repeatedly fail.

9. **Make the photo available.** The feed service can include the photo once its publication rules are satisfied. The client can initially show a processing state if thumbnails are not ready.

10. **Serve future views.** When another user requests the feed, the feed service returns photo metadata and image URLs. The CDN serves cached images where permitted; cache misses are served from object storage.

### Failure Handling

- If an upload fails, the client can retry without creating duplicate posts.
- Upload and processing operations should be idempotent so retries do not create duplicate records or thumbnails.
- If a worker fails, the queue retains or redelivers the job according to its retry policy.
- If thumbnail generation is delayed, the original can remain stored while the system reports a pending processing status.
- Monitoring alerts operators to persistent upload failures, growing queues, or unavailable storage.

## 5. Handling High Traffic

### Horizontal Scaling

Application services should run as multiple instances behind a load balancer. Instances can scale independently according to request volume and resource usage.

### Caching

Frequently requested feed data and image content can be cached. The CDN is particularly useful for image delivery, while an application cache can reduce repeated feed and metadata queries.

Cache invalidation and authorization must be considered when posts are edited, deleted, or made private.

### Database Optimization

- Add indexes for common queries, such as retrieving posts by user and creation time.
- Use pagination rather than returning an entire feed at once.
- Use read replicas for eligible read-heavy workloads.
- Keep writes on the primary database unless a deliberately designed alternative is used.
- Monitor slow queries, connection counts, replication lag, and storage growth.

### Asynchronous Processing

Thumbnail generation and other non-essential work should run in background workers rather than delaying the upload request. Worker capacity can increase when queue depth rises.

### Object Storage and CDN

Original photos and thumbnails belong in object storage. A CDN reduces repeated origin requests and distributes image traffic across edge locations.

### Peak Traffic

Daily averages do not capture sudden surges caused by popular events or viral posts. The system should be load-tested against expected peak requests per second, with additional capacity for application servers, caches, queues, and databases.

## 6. Architectural Trade-Offs

### Trade-Off 1: Direct Uploads vs. Uploading Through Application Servers

**Direct uploads to object storage**

Advantages:
- Reduce application server bandwidth consumption.
- Support large files efficiently.
- Allow application services to scale separately from image transfer.

Disadvantages:
- Require secure presigned URL management.
- Need upload-completion verification and cleanup of abandoned uploads.
- Make the upload flow more complex.

**Decision:** Use direct uploads to object storage, with short-lived upload permissions and backend verification.

### Trade-Off 2: Synchronous vs. Asynchronous Thumbnail Generation

**Synchronous processing** generates thumbnails before the upload request finishes. It offers a simpler immediate completion flow but increases response times and ties up application resources.

**Asynchronous processing** places a job on a queue and lets background workers generate thumbnails. It improves upload responsiveness and supports independent worker scaling, but introduces processing delays and more operational complexity.

**Decision:** Use asynchronous processing because thumbnail generation does not need to block the initial file upload.

### Trade-Off 3: Read Replicas vs. Strongly Consistent Reads

Read replicas improve read throughput and can reduce load on the primary database. However, replication is often asynchronous, so a recent upload or profile update might not immediately appear when a subsequent read is served by a replica.

This is an example of **eventual consistency**: replica data catches up over time, but it may temporarily be stale.

**Decision:** Use replicas for feed browsing and other read-heavy queries where brief delays are acceptable. For actions that require the latest state, such as verifying a transaction or enforcing a critical write constraint, use the primary database or another mechanism that guarantees the required consistency.

### Trade-Off 4: Precomputed Feeds vs. On-Demand Feed Generation

Precomputed feeds can make reads fast because feed entries are prepared in advance. However, writing each new post into many followers' feeds can create substantial write amplification for users with many followers.

On-demand feed generation reduces fan-out writes but can make reads more expensive because the service must combine posts at request time.

**Decision:** Use a hybrid strategy. Precompute feeds for ordinary accounts and consider on-demand retrieval for accounts with exceptionally large follower counts. Measure the resulting read latency and write load before tuning the approach.

### Trade-Off 5: Cache Performance vs. Freshness

Caching improves latency and reduces backend load, but cached feeds and images can become stale after edits, deletions, or visibility changes.

**Decision:** Use explicit cache expiration and invalidation rules. Apply stricter controls to private or deleted content, and avoid relying on cached data for security-sensitive authorization decisions.

## 7. Risks and Monitoring

| Risk | Mitigation | Monitoring |
|---|---|---|
| Sudden traffic spikes | Autoscaling, rate limiting, load testing | Requests per second, latency |
| Queue backlog | Scale workers, retry failed jobs safely | Queue depth, job age |
| Database overload | Indexing, caching, read replicas | CPU, connections, slow queries |
| Replication lag | Route consistency-sensitive reads appropriately | Replica lag |
| Failed photo uploads | Retry support, verification, cleanup jobs | Upload success rate |
| Thumbnail failures | Idempotent workers, retries, dead-letter queue | Processing errors |
| High storage costs | Lifecycle policies, compression, retention rules | Storage growth and cost |
| Unauthorized image access | Access controls, signed URLs, correct CDN policies | Access-denied events, security logs |

The system should also track feed latency percentiles, image-delivery latency, cache-hit ratio, error rates, and availability. These metrics help identify bottlenecks and guide capacity planning.

## Conclusion

SnapShare can scale by separating API services, structured metadata, image storage, and background processing. Object storage handles large photos, a CDN improves image delivery, caching reduces repeated reads, and read replicas help serve a read-heavy workload. A message queue and background workers keep thumbnail generation out of the critical upload path.

The estimated annual image-storage requirement is approximately **748 TB**, based on 1 million uploads per day, 2 MB original photos, and 0.05 MB thumbnails. These estimates provide a starting point for capacity planning and should be validated through load testing and actual usage metrics.
