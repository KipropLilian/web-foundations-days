
# SnapShare: Photo App Scaling Design

## 1. Context and Requirements

### Context

SnapShare is a photo-sharing application where users upload photos, browse feeds, and view images shared by other users. The system must support high volumes of photo uploads and feed requests while keeping image delivery fast and reliable.

### Functional Requirements

1. Users can register, log in, and manage their accounts.
2. Users can upload photos and view their uploaded photos.
3. Users can browse feeds containing photos from other users.
4. The system generates thumbnails in different sizes for faster delivery.
5. Users can view photos and their associated metadata.
6. The system stores original images and thumbnails and tracks their processing status.
7. Users can delete their own photos.
8. The system handles failed uploads and thumbnail-generation jobs safely.

### Non-Functional Requirements

- **Performance:** Feed requests should normally complete within 500 ms at the 95th percentile, excluding unusually slow network conditions.
- **Availability:** Users should still be able to browse previously processed photos when thumbnail workers are temporarily unavailable.
- **Scalability:** The system should support increasing numbers of users, uploads, and feed requests by scaling appropriate components independently.
- **Durability:** Successfully accepted original images and their metadata should not be lost during ordinary service failures.
- **Consistency:** Photo ownership and metadata changes must be handled reliably. Newly uploaded photos may briefly remain in a processing state while thumbnails are generated.
- **Security:** Users must be authenticated for private operations, and uploaded files must be validated. Private images must not be exposed through public URLs.
- **Maintainability:** Image processing should be separated from normal request handling so each component can be monitored and scaled independently.

## 2. Traffic and Storage Estimates

The following are planning assumptions for SnapShare. They should be validated against actual application metrics and load tests.

### Assumptions

- Registered users: 10 million.
- Daily active users: 1 million.
- Each daily active user views 50 feed items per day.
- Each daily active user uploads 1 photo per day.
- Average original photo size: 2 MB.
- Average total thumbnail storage per photo: 0.2 MB.
- One day contains 86,400 seconds.

### Normal Traffic

**Feed reads per day**

1,000,000 daily active users × 50 feed items = 50,000,000 feed-item views per day.

Average feed-item view rate:

50,000,000 ÷ 86,400 ≈ 579 feed-item views per second.

**Photo uploads per day**

1,000,000 daily active users × 1 upload = 1,000,000 uploads per day.

Average upload rate:

1,000,000 ÷ 86,400 ≈ 11.6 uploads per second.

Assuming a peak factor of five:

- Peak feed-item view rate: approximately 2,894 per second.
- Peak upload rate: approximately 58 uploads per second.

These are estimates. A feed request may return multiple items, and each item may cause additional image requests. Therefore, actual HTTP request rates can be higher than the feed-item calculations.

### Annual Storage

**Original images**

1,000,000 uploads/day × 365 days × 2 MB = 730,000,000 MB, or approximately 730 TB per year using decimal units.

**Thumbnails**

1,000,000 uploads/day × 365 days × 0.2 MB = 73,000,000 MB, or approximately 73 TB per year.

**Total new image storage**

730 TB + 73 TB = approximately 803 TB per year.

This estimate excludes replication, backups, metadata, temporary processing files, and storage overhead. Actual storage requirements depend on retention policies, image compression, and thumbnail sizes.

### Read-Heavy Workload

The ratio of feed-item views to uploads is:

50,000,000 ÷ 1,000,000 = 50:1.

SnapShare is therefore strongly read-heavy. Caching, a content delivery network (CDN), and database read replicas can reduce the work reaching the application servers and primary database.

The design must also protect upload processing from bursts. At the estimated peak, a queue can absorb incoming thumbnail jobs while background workers process them at a controlled rate.

## 3. High-Level Architecture

```text
                     Users
                       |
                    DNS / CDN
                       |
               Load Balancer / WAF
                       |
                Application Servers
                       |
             +---------+----------+
             |         |          |
           Cache   Primary DB   Object Storage
                       |          |
                 Read Replicas    |
                                  |
                            Original Images
                                  |
Application Server --> Message Queue
                            |
                     Background Workers
                            |
                    Generate Thumbnails
                            |
                      Object Storage
                            |
                  Update Photo Metadata
                            |
                   CDN serves thumbnails
```

### Component Explanations

**DNS and CDN**

DNS directs users to the service. The CDN caches suitable public images and static assets close to users, reducing latency and requests reaching the origin infrastructure.

**Load balancer and WAF**

The load balancer distributes incoming requests across healthy application servers. A web application firewall (WAF) and rate limiting help block malicious traffic and abusive request patterns.

**Application servers**

Application servers authenticate users, validate uploads, check permissions, manage photo metadata, and coordinate storage and background processing. They should avoid generating thumbnails synchronously during the upload request.

**Cache**

A cache such as Redis stores frequently requested feed data and metadata. This reduces repeated database queries. Cache expiry or invalidation is needed when relevant information changes.

**Primary database**

The primary relational database stores metadata such as photo IDs, owners, object-storage keys, timestamps, and processing statuses. It is the authoritative source for metadata changes.

**Read replicas**

Read replicas handle suitable read-heavy queries, such as feed and profile listings, reducing pressure on the primary database. Because replication can lag, the application must account for recently changed records that have not reached a replica.

**Object storage**

Object storage holds original image files and generated thumbnails. Large binary files are kept separate from relational metadata, allowing storage to scale independently.

**Message queue**

A durable message queue stores thumbnail-generation jobs until workers can process them. This separates image processing from the user-facing upload request and absorbs temporary upload bursts.

**Background workers**

Workers consume queued jobs, retrieve original images, generate thumbnails, upload the results to object storage, and update the photo processing status. Workers can scale horizontally when the queue grows.

**Monitoring and backups**

Monitoring tracks latency, errors, queue depth, processing failures, storage growth, database performance, and replica lag. Backups and recovery procedures help protect metadata and stored images from data loss.

## 4. Step-by-Step Upload Flow

The upload workflow separates accepting the original image from generating thumbnails. This prevents expensive image-processing work from blocking normal application requests.

1. **The client submits a photo.** An authenticated user selects an image and uploads it over HTTPS. The request includes the image and any required metadata.

2. **The application validates the upload.** The application checks authentication, ownership permissions, file size, permitted formats, and other validation rules. Invalid uploads are rejected before processing begins.

3. **The original image is stored.** The application stores the original image in object storage under a unique object key. For large uploads, a pre-authorised direct-to-storage upload can reduce application-server bandwidth and processing overhead.

4. **Photo metadata is recorded.** The application creates a database record containing the photo ID, user ID, original object key, upload timestamp, and processing status such as `PROCESSING`.

5. **A thumbnail job is queued.** The application publishes a message containing the photo ID and original object key to the durable message queue. The job publication must be retried safely if the queue is temporarily unavailable. A transactional outbox can help ensure that a database update and its corresponding job are not silently separated by a failure.

6. **The upload request completes.** Once the original image is safely stored and the required metadata and processing-job hand-off are secured, the API returns a successful acceptance response. The interface can tell the user that the photo has been received while thumbnails are still processing.

7. **A worker retrieves the job.** A background worker consumes the queued message and fetches the original image from object storage.

8. **The worker generates thumbnails.** The worker decodes and resizes the image into required thumbnail dimensions. Processing should have memory and time limits to prevent unusually large or malformed files from exhausting worker resources.

9. **Thumbnails are stored.** The worker uploads the generated thumbnails to object storage using consistent object keys. Retried jobs should be idempotent so they do not produce conflicting results.

10. **The metadata is updated.** After the required thumbnails are successfully stored, the worker changes the photo status to `READY`. If processing fails, the job can be retried; repeated failures should be recorded for investigation.

11. **The photo becomes available in feeds.** The application provides the appropriate image URLs. The CDN can serve the thumbnails to users without sending every image request through the application servers.

### Why Background Processing Matters

Generating thumbnails consumes CPU, memory, and time. If each application server must generate all thumbnails before responding to an upload, a sudden upload burst can occupy request-handling resources and slow down unrelated requests.

The queue allows the application to accept uploads without waiting for thumbnail generation to finish. Workers process jobs independently, and additional workers can be started when queue depth or job age increases.

Asynchronous processing does not eliminate the work. It moves that work out of the critical request path. If the queue grows faster than workers can process jobs, thumbnails will appear later. The interface should show a clear processing state, and monitoring should alert operators when job delays become excessive.

## 5. How the System Handles High Traffic

### Read Scaling

Because SnapShare has approximately 50 feed-item views for every upload, read traffic is the main workload.

- Cache frequently requested feed metadata.
- Serve images and thumbnails through the CDN.
- Use database read replicas for suitable queries.
- Add application servers behind a load balancer as demand increases.
- Use pagination and efficient database indexes to avoid returning unnecessarily large feeds.

The CDN and cache reduce repeated requests reaching the origin, while read replicas distribute database query load.

### Upload Scaling

Uploads consume bandwidth and storage, while thumbnail generation consumes processing resources.

- Store binary files in object storage rather than relational tables.
- Queue thumbnail jobs so incoming uploads do not block application servers.
- Scale workers independently according to queue depth and processing latency.
- Limit upload size and validate file formats.
- Apply backpressure when storage, queues, or workers approach their safe operating capacity.

### Reliability

Application servers should be stateless so that requests can be distributed across instances. If one server fails, the load balancer can route requests to healthy servers.

The queue should be durable, and workers should support retries and idempotent processing. Failed jobs should not be silently discarded. Database backups, object-storage protection, and recovery procedures should be tested.

If thumbnail processing is temporarily unavailable, the application can retain the original image and show a processing indicator, provided the original upload and metadata have been safely recorded.

## 6. Architectural Trade-Offs

### Trade-Off 1: Asynchronous Processing vs Immediate Availability

**Benefit:** The upload request completes without waiting for thumbnail generation. Application servers remain responsive, and workers can be scaled independently.

**Cost:** Thumbnails are not available immediately. The system requires a queue, processing states, retries, failure handling, and monitoring. Users may temporarily see a placeholder.

This is an appropriate trade-off because keeping uploads responsive is more important than generating every thumbnail before the initial response.

### Trade-Off 2: Object Storage vs Relational Database Storage

**Benefit:** Object storage is designed for large binary files and scales independently of relational metadata. Keeping images out of relational tables reduces database growth and avoids unnecessary pressure on database indexes and backups.

**Cost:** The application must coordinate object storage with database records. A partial failure could leave an orphaned file or a metadata record pointing to a missing object. Retry logic, reconciliation jobs, and cleanup procedures are required.

### Trade-Off 3: Read Replicas vs Immediate Consistency

**Benefit:** Read replicas distribute feed and metadata queries, reducing load on the primary database.

**Cost:** Replication can lag behind the primary. A newly uploaded photo or updated profile may not appear immediately when a read is served from a replica.

The application can route read-after-write requests to the primary database or otherwise handle recently changed data until replicas catch up.

### Trade-Off 4: CDN Caching vs Freshness and Access Control

**Benefit:** Frequently accessed images and thumbnails can be delivered quickly from locations near users, reducing latency and origin traffic.

**Cost:** Cached images may remain available after a deletion or permission change. Appropriate cache expiry, invalidation, versioned URLs, and access controls are necessary. Private images must not be exposed through publicly accessible cache entries.

### Trade-Off 5: More Workers vs Operating Cost

**Benefit:** Additional workers can reduce queue delays when upload traffic rises.

**Cost:** More workers increase compute costs and can place extra pressure on object storage and the database. Worker scaling should consider queue depth, job age, downstream service capacity, and processing errors.

## 7. Risks and Monitoring

Important failure cases include an image being stored while its metadata write fails, a worker crashing during processing, a job being delivered more than once, and a read replica temporarily returning stale data.

The system should use retryable and idempotent jobs, reconcile incomplete uploads, and monitor:

- Upload request latency and error rates.
- Queue depth and age of the oldest queued job.
- Thumbnail processing duration and failure rate.
- Application server CPU and memory utilisation.
- Database query latency and read-replica lag.
- Object-storage errors and storage growth.
- CDN cache hit rate and image-delivery latency.

These measurements help determine whether to scale application servers, workers, storage, or database capacity. Additional infrastructure should be introduced to address measured bottlenecks rather than added without a clear reason.

## Conclusion

SnapShare is a read-heavy photo-sharing system that needs fast image delivery and reliable upload processing. Caching, a CDN, and read replicas support feed performance, while object storage separates large image files from relational metadata.

The message queue and background workers are central to upload scalability: they allow application servers to accept uploads without waiting for thumbnails to be generated. The design also recognises the costs of asynchronous processing, eventual consistency, caching, and additional infrastructure.

The next step is to validate these assumptions through load testing and failure testing, especially during upload bursts and temporary worker or storage outages.
