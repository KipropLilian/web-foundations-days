
# TicketHub: Event Ticketing System Design

## 1. Overview

TicketHub is an online event ticketing platform where customers can discover events, select available seats, reserve tickets, pay securely, and receive tickets. The system must handle normal browsing traffic and sudden traffic spikes during popular ticket sales.

The main design challenge is preventing two customers from purchasing the same seat while keeping the website responsive during high demand.

## 2. Functional Requirements

1. Users can register, log in, and manage their profiles.
2. Users can browse events and view event details.
3. Users can view available seats and ticket prices.
4. Users can temporarily hold seats while completing checkout.
5. Users can pay for tickets using a supported payment provider.
6. Users receive confirmation and tickets after successful payment.
7. Users can view their orders and ticket status.
8. Administrators can create events and manage ticket inventory.

## 3. Non-Functional Requirements

- **Scalability:** Handle high traffic during popular ticket sales.
- **Availability:** Keep browsing and ticket purchasing available despite individual component failures.
- **Performance:** Return normal browsing responses quickly and minimize checkout delays.
- **Consistency:** Never confirm two valid purchases for the same seat.
- **Security:** Protect user information, payment references, and ticket access.
- **Reliability:** Support payment retries and recovery from failed requests.
- **Auditability:** Maintain a traceable record of holds, orders, and payment outcomes.

## 4. Traffic and Capacity Estimates

These figures are planning assumptions, not measured production traffic.

### Normal Traffic

Assume:
- 50,000 visitors per day.
- Each visitor views 10 pages.
- One day has 86,400 seconds.

Daily page views:

50,000 × 10 = 500,000 page views/day.

Average page-view rate:

500,000 ÷ 86,400 ≈ **5.8 page views per second**.

Actual traffic will vary throughout the day, so average traffic alone is not enough for capacity planning.

### Peak Ticket Sale

Assume:
- 200,000 buyers attempt to purchase tickets during a 10-minute sale.
- The sale lasts 600 seconds.
- A peak surge of 1,000 participants per second is used as a stress-testing target.
- The event has 20,000 seats.

Average buyer arrival rate during the sale:

200,000 ÷ 600 ≈ **333 buyers per second**.

A reasonable initial stress-test target is **1,000 participants per second**, approximately three times the calculated average arrival rate. This is a design target, not a guaranteed maximum capacity.

Demand-to-seat ratio:

200,000 buyers ÷ 20,000 seats = **10 buyers per seat**.

This means demand is ten times available inventory. The system must handle rejected attempts gracefully and must not oversell seats.

### Capacity Strategy

- Use a CDN to serve static files and cache public event information.
- Run multiple stateless application instances behind a load balancer.
- Cache event listings and seat-map display data, but never trust cached availability to authorize a sale.
- Use database transactions and constraints to protect inventory.
- Apply rate limits and admission controls during peak sales.
- Use queues for non-critical work, such as sending confirmation emails.
- Load-test the checkout path separately from ordinary browsing.

## 5. API Specification

All endpoints use HTTPS and JSON. Authenticated endpoints require a valid user session or access token.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/events` | List and search events |
| GET | `/api/events/{eventId}` | Retrieve event details |
| GET | `/api/events/{eventId}/seats` | Display seat information and indicative availability |
| POST | `/api/holds` | Temporarily hold a seat |
| GET | `/api/holds/{holdId}` | Retrieve hold status and expiry |
| DELETE | `/api/holds/{holdId}` | Release an active hold |
| POST | `/api/orders` | Create an order from a valid hold |
| GET | `/api/orders/{orderId}` | Retrieve order status |
| POST | `/api/payments` | Initiate payment for an order |
| POST | `/api/payments/webhook` | Receive payment-provider status updates |
| GET | `/api/tickets/{ticketId}` | Retrieve a purchased ticket |

### Example: Hold a Seat

Request:

```http
POST /api/holds
Authorization: Bearer <access-token>
Idempotency-Key: 7d3d9e4a-unique-request-id
Content-Type: application/json
```

```json
{
  "event_id": 101,
  "seat_id": 502
}
```

Successful response:

```json
{
  "hold_id": "hold-abc123",
  "event_id": 101,
  "seat_id": 502,
  "status": "HELD",
  "expires_at": "2026-10-18T15:10:00Z"
}
```

If another customer already holds or purchased the seat, the API returns a conflict response, such as HTTP `409 Conflict`.

The idempotency key identifies retries of the same logical request. The server stores the key and its result so a network retry does not create a second hold.

### API Error Handling

- `400 Bad Request`: Invalid input.
- `401 Unauthorized`: Missing or invalid authentication.
- `403 Forbidden`: The user is not permitted to perform the action.
- `404 Not Found`: The requested event, seat, or order does not exist.
- `409 Conflict`: The seat is no longer available or the request conflicts with the current state.
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: Unexpected server failure.

## 6. Database Design

A relational database such as PostgreSQL is suitable because seat allocation and order creation require reliable transactions and uniqueness constraints.

The following schema uses four core tables: `users`, `events`, `seats`, and `orders`. Payment records can be added as a separate table in a production extension.

### Table 1: users

Stores customer account information.

| Column | Type | Constraints |
|---|---|---|
| `user_id` | BIGINT | Primary key |
| `full_name` | VARCHAR(150) | NOT NULL |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL |
| `password_hash` | TEXT | NOT NULL |
| `created_at` | TIMESTAMPTZ | NOT NULL, default current time |

Passwords must be stored as secure password hashes, never as plaintext.

### Table 2: events

Stores event information.

| Column | Type | Constraints |
|---|---|---|
| `event_id` | BIGINT | Primary key |
| `title` | VARCHAR(200) | NOT NULL |
| `venue` | VARCHAR(200) | NOT NULL |
| `starts_at` | TIMESTAMPTZ | NOT NULL |
| `sales_open_at` | TIMESTAMPTZ | NOT NULL |
| `sales_close_at` | TIMESTAMPTZ | NOT NULL |
| `created_at` | TIMESTAMPTZ | NOT NULL, default current time |

An event has many seats. Its sale window controls when customers can attempt to reserve inventory.

### Table 3: seats

Stores the inventory for each event.

| Column | Type | Constraints |
|---|---|---|
| `seat_id` | BIGINT | Primary key |
| `event_id` | BIGINT | Foreign key to `events.event_id` |
| `seat_label` | VARCHAR(30) | NOT NULL |
| `price` | NUMERIC(10,2) | NOT NULL, CHECK price >= 0 |
| `status` | VARCHAR(20) | NOT NULL, CHECK allowed values |
| `held_by` | BIGINT | Nullable foreign key to `users.user_id` |
| `hold_expires_at` | TIMESTAMPTZ | Nullable |
| `order_id` | BIGINT | Nullable |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default current time |

Allowed seat statuses are `AVAILABLE`, `HELD`, and `SOLD`.

A unique constraint on `(event_id, seat_label)` prevents duplicate seat labels within an event. The `order_id` references the order that purchased the seat and is nullable until the seat is sold.

### Table 4: orders

Stores checkout and purchase records.

| Column | Type | Constraints |
|---|---|---|
| `order_id` | BIGINT | Primary key |
| `user_id` | BIGINT | Foreign key to `users.user_id` |
| `event_id` | BIGINT | Foreign key to `events.event_id` |
| `seat_id` | BIGINT | Foreign key to `seats.seat_id`, UNIQUE |
| `amount` | NUMERIC(10,2) | NOT NULL, CHECK amount >= 0 |
| `status` | VARCHAR(20) | NOT NULL |
| `idempotency_key` | VARCHAR(255) | UNIQUE, NOT NULL |
| `created_at` | TIMESTAMPTZ | NOT NULL, default current time |

Order statuses include `PENDING`, `PAID`, `FAILED`, and `CANCELLED`.

The unique constraint on `seat_id` ensures that no two order records can purchase the same seat. The database constraint acts as a final safeguard even if application-level checks fail.

### Relationships

- One user can create many orders.
- One event can contain many seats.
- One event can have many orders.
- Each order belongs to one user and one event.
- Each order references one seat.
- A seat can be temporarily held by one user.
- A sold seat is linked to its completed order.

### Example PostgreSQL Schema

The following SQL demonstrates the core tables and constraints. It assumes IDs are generated by the database.

```sql
CREATE TABLE users (
    user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE events (
    event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    venue VARCHAR(200) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    sales_open_at TIMESTAMPTZ NOT NULL,
    sales_close_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (sales_close_at > sales_open_at)
);

CREATE TABLE orders (
    order_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    event_id BIGINT NOT NULL REFERENCES events(event_id),
    seat_id BIGINT NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    status VARCHAR(20) NOT NULL
        CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'CANCELLED')),
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE seats (
    seat_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(event_id),
    seat_label VARCHAR(30) NOT NULL,
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN ('AVAILABLE', 'HELD', 'SOLD')),
    held_by BIGINT REFERENCES users(user_id),
    hold_expires_at TIMESTAMPTZ,
    order_id BIGINT UNIQUE REFERENCES orders(order_id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, seat_label)
);

ALTER TABLE orders
    ADD CONSTRAINT orders_seat_fk
    FOREIGN KEY (seat_id) REFERENCES seats(seat_id);

CREATE INDEX seats_event_status_idx
    ON seats(event_id, status);

CREATE INDEX orders_user_created_idx
    ON orders(user_id, created_at DESC);
```

The `orders.seat_id` unique constraint ensures only one order record can reference a seat. In a production implementation, the order and seat creation sequence must be designed carefully to handle foreign-key dependencies and transactional writes.

## 7. Preventing Double-Booking

**The database is the authority for seat ownership.** A cached seat map may be stale, so the server must recheck availability in the database when a user attempts to hold a seat.

### Conditional Update for a Seat Hold

The following PostgreSQL statement atomically claims a seat only if it is available or its previous hold has expired:

```sql
UPDATE seats
SET status = 'HELD',
    held_by = $1,
    hold_expires_at = NOW() + INTERVAL '10 minutes',
    updated_at = NOW()
WHERE seat_id = $2
  AND (
      status = 'AVAILABLE'
      OR (
          status = 'HELD'
          AND hold_expires_at <= NOW()
      )
  )
RETURNING seat_id, status, held_by, hold_expires_at;
```

Parameters:
- `$1`: authenticated user's ID.
- `$2`: requested seat ID.

If the statement returns one row, the hold was successfully acquired. If it returns no rows, the seat is already held by someone else or has been sold.

PostgreSQL evaluates the update atomically under concurrent access. If two buyers attempt to hold the same seat, only one can successfully change the row from an eligible state. The other request must observe the updated state and fail.

### Transaction for Creating a Hold and Order

For a more complete implementation, the server can execute the following steps inside one database transaction:

```sql
BEGIN;

-- Claim the seat if it is available or its previous hold expired.
UPDATE seats
SET status = 'HELD',
    held_by = $1,
    hold_expires_at = NOW() + INTERVAL '10 minutes',
    updated_at = NOW()
WHERE seat_id = $2
  AND (
      status = 'AVAILABLE'
      OR (
          status = 'HELD'
          AND hold_expires_at <= NOW()
      )
  )
RETURNING seat_id, event_id, price;
```

The application must check that exactly one row was returned. If no row was returned, it must roll back and report that the seat is unavailable.

If a row was returned, the application creates a pending order using the returned event, seat, and price values:

```sql
INSERT INTO orders (
    user_id,
    event_id,
    seat_id,
    amount,
    status,
    idempotency_key
)
VALUES ($1, $3, $2, $4, 'PENDING', $5)
RETURNING order_id;
```

The application then links the held seat to the newly created order:

```sql
UPDATE seats
SET order_id = $6,
    updated_at = NOW()
WHERE seat_id = $2
  AND status = 'HELD'
  AND held_by = $1;
```

If all operations succeed, the application commits. If any operation fails, it rolls back.

```sql
COMMIT;
```

In application code, `COMMIT` must occur only after all required operations succeed. On any error, execute `ROLLBACK`. The placeholders must be populated with validated values, and the implementation should verify affected-row counts.

### Payment and Final Sale

The payment provider must not be called while holding a long-running database transaction open.

A safer flow is:

1. Create a time-limited hold and pending order in a short database transaction.
2. Commit the transaction.
3. Initiate payment with the payment provider using an idempotency key.
4. Receive the payment result through a verified webhook or trusted provider-status check.
5. In a new database transaction, lock and validate the seat and order.
6. If payment succeeded and the hold is still valid, mark the order `PAID` and seat `SOLD` atomically.
7. If payment fails or the hold expires, release the seat according to the payment and hold policy.

The final sale transition must verify that the seat is still held for the correct user and order. It must also be idempotent so duplicate payment notifications do not create duplicate purchases.

For example, the finalization transaction can use a conditional update:

```sql
BEGIN;

UPDATE seats
SET status = 'SOLD',
    hold_expires_at = NULL,
    updated_at = NOW()
WHERE seat_id = $1
  AND status = 'HELD'
  AND held_by = $2
  AND order_id = $3
  AND hold_expires_at > NOW()
RETURNING seat_id;
```

The application must verify that exactly one row was returned. If no row was returned, it must not mark the order as paid; it must follow a defined payment-reconciliation or refund process.

When the seat transition succeeds, update the order in the same transaction:

```sql
UPDATE orders
SET status = 'PAID'
WHERE order_id = $3
  AND user_id = $2
  AND status = 'PENDING';

COMMIT;
```

The application must check the order update's affected-row count and roll back if it is not exactly one. The seat and order updates must commit together or not at all.

### Why This Prevents Double-Booking

- Atomic conditional updates prevent two concurrent requests from successfully claiming the same available seat.
- The unique `orders.seat_id` constraint prevents multiple orders from referencing the same seat.
- A short hold expiration prevents abandoned checkouts from reserving inventory indefinitely.
- Idempotency keys make retries safer.
- Database transactions keep seat status and order status synchronized.
- Payment reconciliation handles late, duplicated, or conflicting payment notifications.

## 8. Architecture Diagram

```text
                    Customers
                        |
                        v
                  CDN / WAF
                        |
                        v
                  Load Balancer
                        |
                        v
                    API Gateway
                        |
             +----------+----------+
             |          |          |
             v          v          v
        Event Service Seat Service Order Service
             |          |          |
             +----------+----------+
                        |
                        v
                  PostgreSQL
               Primary + Replicas
                        |
             +----------+----------+
             |                     |
             v                     v
        Payment Service       Message Queue
             |                     |
             v                     v
      Payment Provider       Email / Ticket Workers
             |
             v
      Verified Webhooks
             |
             v
        Order Finalization
```

### Architecture Components

**CDN and WAF:** Deliver static content and help protect the platform from abusive traffic.

**Load balancer and API gateway:** Distribute requests and enforce common access, validation, and rate-limiting policies.

**Event service:** Handles event listings and event details. Public event data can be cached.

**Seat service:** Reads seat-map information and performs authoritative seat holds using database transactions and conditional updates.

**Order service:** Creates orders, tracks order status, and coordinates checkout.

**PostgreSQL:** Stores users, events, seats, and orders. The primary database handles authoritative writes. Read replicas can serve suitable browsing queries.

**Payment service:** Initiates payment requests, verifies provider notifications, and coordinates finalization or reconciliation.

**Message queue and workers:** Handle non-critical asynchronous work, such as sending email confirmations and preparing ticket notifications.

### Handling Sale Spikes

- Serve public event pages and static assets through the CDN.
- Use caching for event information, but never use cached availability to authorize a seat sale.
- Apply rate limiting and queue or admission controls to protect checkout services.
- Scale stateless services horizontally.
- Monitor database connection pools and transaction latency.
- Load-test concurrent attempts for the same seat and large numbers of distinct seats.
- Keep transactions short to reduce lock contention.

## 9. Architectural Trade-Offs

### Trade-Off 1: Database Consistency vs. Read Performance

Read replicas improve throughput for browsing but can lag behind the primary database. A customer might briefly see stale availability after another customer reserves a seat.

**Decision:** Use replicas and caches for event browsing where brief staleness is acceptable. Use the primary database for seat holds and final sale transitions. Never rely on a read replica to make the final booking decision.

### Trade-Off 2: Temporary Holds vs. Immediate Purchase

Temporary holds give customers time to complete checkout and reduce simultaneous contention. However, they temporarily make seats unavailable to other customers, and abandoned holds require expiration and cleanup.

**Decision:** Use short-lived holds with explicit expiry timestamps. The database checks expiry when a new hold is requested, while a background job can clean up expired records.

### Trade-Off 3: Synchronous vs. Asynchronous Work

Sending emails and preparing notifications synchronously increases checkout latency. Asynchronous processing improves responsiveness but introduces queue delays and retry complexity.

**Decision:** Commit the purchase state first, then use a queue for notifications. A durable outbox or equivalent reliable event-publishing mechanism can prevent notification jobs from being lost between a database commit and message publication.

### Trade-Off 4: Strict Inventory Guarantees vs. Maximum Throughput

Locking and updating seat rows adds database contention during a popular sale. However, allowing concurrent purchases without authoritative inventory control risks overselling.

**Decision:** Prioritize correctness for seat allocation. Improve throughput with indexing, short transactions, admission controls, and horizontal scaling of stateless services rather than weakening inventory guarantees.

### Trade-Off 5: Precomputed Seat Maps vs. Live Availability

Caching seat maps makes browsing faster, but cached availability can become outdated quickly during a sale.

**Decision:** Cache the display representation where useful, label availability as indicative when necessary, and always perform a fresh atomic database operation when a customer requests a hold.

## 10. Monitoring and Failure Recovery

| Risk | Mitigation | Monitoring |
|---|---|---|
| Double-booking attempts | Conditional updates, unique constraints, transactions | Booking conflicts and integrity checks |
| Traffic spikes | Rate limits, admission control, horizontal scaling | Requests per second and latency |
| Database overload | Indexes, short transactions, connection pooling | CPU, connections, lock waits |
| Payment webhook retries | Idempotent processing and reconciliation | Duplicate notifications and failures |
| Expired holds | Expiry checks and cleanup jobs | Number and age of expired holds |
| Queue backlog | Scale workers and retry safely | Queue depth and oldest message age |
| Stale replicas | Route critical reads to primary | Replication lag |
| Notification failure | Retry policy and dead-letter queue | Delivery failure rate |

## Conclusion

TicketHub separates browsing, seat allocation, order management, payment processing, and background notifications so each component can scale according to its workload.

The central protection against double-booking is an atomic conditional update in the authoritative database, supported by a unique constraint on the seat referenced by orders and transactions that keep seat and order states synchronized. Caches and replicas improve performance but are never treated as the authority for inventory decisions.

Capacity planning starts with approximately 5.8 normal page views per second, 333 buyer arrivals per second during a ten-minute sale, and a 1,000-participant-per-second stress-test target. The architecture should be validated through load testing, especially for concurrent attempts to reserve the same seat.
