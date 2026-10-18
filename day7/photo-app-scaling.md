
# SnapShare: Photo-App Scaling Plan

## 1. Assumptions

- SnapShare has 10 million registered users.
- 10% of registered users are active each day.
- Each daily active user uploads one photo and views 50 feed pages per day.
- Each original photo is 2 MB, and each thumbnail is 50 KB.
- A year has 365 days.
- Uploads and feed views are distributed across 24 hours when calculating average rates.
- Peak traffic is five times the average rate.
- Storage estimates exclude backups, database metadata, logs, replication overhead and other application data.
- For simple storage calculations, 1 GB = 1,000 MB and 1 TB = 1,000 GB.

## 2. Traffic and Storage Estimates

### Daily active users

Daily active users = 10,000,000 × 10%

= **1,000,000 active users per day**

### Uploads per second

Each active user uploads one photo per day.

Daily uploads = 1,000,000 × 1

= **1,000,000 uploads per day**

Average uploads per second = 1,000,000 ÷ 86,400

= **11.57 uploads per second**

Peak uploads per second = 11.57 × 5

= **57.87 uploads per second**

### Feed views per second

Each active user views 50 feed pages per day.

Daily feed views = 1,000,000 × 50

= **50,000,000 feed views per day**

Average feed views per second = 50,000,000 ÷ 86,400

= **578.70 feed views per second**

Peak feed views per second = 578.70 × 5

= **2,893.52 feed views per second**

These figures estimate feed-page requests, not the total number of individual photo requests. A single feed page may display multiple photos.

### Photo storage per year

Original photo storage per day:

1,000,000 × 2 MB = 2,000,000 MB = 2,000 GB = 2 TB

Original photo storage per year:

2 TB × 365 = **730 TB per year**

Thumbnail storage per day:

1,000,000 × 50 KB = 50,000,000 KB = 50 GB

Thumbnail storage per year:

50 GB × 365 = **18.25 TB per year**

Total new photo and thumbnail storage per year:

730 TB + 18.25 TB = **748.25 TB per year**

This is the estimated storage for one year's uploads, before backups, replicas, and additional image sizes. If content is never deleted, storage will continue accumulating in subsequent years.

### Summary

| Metric | Estimate |
|---|---:|
| Registered users | 10,000,000 |
| Daily active users | 1,000,000 |
| Daily uploads | 1,000,000 |
| Average uploads/second | 11.57 |
| Peak uploads/second | 57.87 |
| Daily feed views | 50,000,000 |
| Average feed views/second | 578.70 |
| Peak feed views/second | 2,893.52 |
| Original storage/year | 730 TB |
| Thumbnail storage/year | 18.25 TB |
| Total new image storage/year | 748.25 TB |

## 3. Read-Heavy or Write-Heavy?

SnapShare is primarily **read-heavy** because users request 50 feed pages per day but upload only one photo per day. This creates approximately 50 feed views for every upload, so the architecture should optimise feed delivery through caching, a CDN, database read replicas and horizontally scalable application servers. Upload processing must still be reliable, but the read path is expected to handle much more frequent traffic.

## 4. Where Photos Should Be Stored

Photo files should be stored in object storage rather than directly inside the relational database. Large binary files increase database storage and backup sizes and can make database operations more expensive. Object storage is designed for large files and can scale independently of the database. The database should store metadata such as photo ID, owner, caption, upload time and object-storage key, while the CDN delivers the photo and thumbnail files efficiently.

## 5. Architecture Diagram

```text
                         +----------------------+
                         |        Users         |
                         +----------+-----------+
                                    |
                         +----------v-----------+
                         |          CDN         |
                         | Cached photos/feed   |
                         +-----+-----------+----+
                               |           |
                  Feed/API requests         | Photo requests
                               |           |
                    +----------v--+        |
                    | Load Balancer|       |
                    +------+-------+       |
                           |               |
              +------------v-----------+   |
              |     App Servers       |   |
              | Feed, auth, upload API|   |
              +---+---------+---------+   |
                  |         |             |
          +-------v--+   +--v------------+|
          |   Cache  |   | Primary DB    ||
          | Feed/meta|   | Users, follows||
          +----------+   | photos, posts ||
                         +--+----------+-+|
                            |          |  |
                      replication      |  |
                            |          |  |
                     +------v------+   |  |
                     | Read Replica|   |  |
                     | Feed reads  |   |  |
                     +-------------+   |  |
                                       |  |
                         +-------------v--v--+
                         |   Object Storage  |
                         | Original photos   |
                         | and thumbnails    |
                         +---------^---------+
                                   |
                             +-----+------+
                             |   Queue    |
                             | Thumbnail  |
                             | jobs       |
                             +-----^------+
                                   |
                             +-----+------+
                             |   Worker   |
                             | Generate   |
                             | thumbnails|
                             +------------+
```

## 6. What Each Component Does

- **CDN:** Caches and delivers photos and thumbnails from locations closer to users, reducing latency and origin-server traffic.
- **Load balancer:** Distributes incoming API requests across healthy application servers so one server does not handle all traffic.
- **App servers:** Handle authentication, uploads, feed generation, following relationships and business logic.
- **Cache:** Stores frequently accessed feed data and metadata to reduce repeated database queries.
- **Primary database:** Stores structured records such as users, follows, photo metadata and posts, and accepts database writes.
- **Read replica:** Serves suitable read queries to reduce load on the primary database.
- **Object storage:** Holds original photo files and generated thumbnails without placing large files inside database rows.
- **Queue:** Stores thumbnail-generation jobs so image processing can happen asynchronously instead of delaying upload responses.
- **Worker:** Consumes queued jobs, creates resized thumbnails and saves them to object storage.

## 7. Photo Upload Flow

1. A user selects a photo and submits it through the application.
2. The app server authenticates the user and validates the file type, file size and upload permissions.
3. The server creates a photo metadata record or upload reservation and assigns a unique photo ID and object-storage key.
4. The original photo is uploaded to object storage. The application confirms the upload only after the file is successfully stored.
5. The app server saves or updates the photo metadata in the primary database, including the owner, timestamp, storage key and processing status.
6. The app server places a thumbnail-generation job on the queue.
7. A worker retrieves the job, reads the original photo, generates a 50 KB thumbnail target and uploads the thumbnail to object storage.
8. The worker updates the photo's processing status in the database.
9. The feed can display the photo when its required metadata and image files are available; the CDN can cache the original and thumbnail for subsequent requests.

The job queue allows uploads to continue even when thumbnail workers are busy. In production, jobs should be retried safely, and failed jobs should be recorded for investigation.

## 8. Trade-Offs

### Caching versus freshness

Caching feed results reduces database load and improves response time, but users may not see new posts or follow changes immediately. Short cache lifetimes and targeted cache invalidation can improve freshness, although they add complexity.

### Asynchronous thumbnails versus immediate availability

Generating thumbnails in the background makes uploads faster and allows workers to scale independently. However, a newly uploaded photo may temporarily have no thumbnail, so the interface needs a processing state or fallback image.

### Read replicas versus consistency

Read replicas increase read capacity, but replication delay can cause users to see stale data after posting or changing a profile. The application may route important read-after-write requests to the primary database.

### Object storage and CDN versus cost and invalidation complexity

Object storage and a CDN scale well for image delivery and reduce application-server bandwidth. However, storage, CDN requests and data transfer cost money, and replacing or deleting cached images requires a clear cache-invalidation strategy.

## Conclusion

SnapShare should separate its structured metadata from image files, scale the read path with caching and read replicas, and process thumbnails asynchronously. The estimates suggest about 2,894 average-adjusted peak feed-page requests per second and approximately 748.25 TB of new image data per year, making efficient image delivery and scalable storage key design priorities.
