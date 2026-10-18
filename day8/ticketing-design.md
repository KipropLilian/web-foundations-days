TicketHub: Event Ticketing System Design
1. Overview
TicketHub is an online event ticketing platform where customers can discover events, select available seats, reserve tickets, pay securely, and receive tickets. The system must handle normal browsing traffic and sudden traffic spikes during popular ticket sales.
The main design challenge is preventing two customers from purchasing the same seat while keeping the website responsive during high demand.
2. Functional Requirements
1. Users can register, log in, and manage their profiles.
2. Users can browse events and view event details.
3. Users can view seats and ticket prices.
4. Users can temporarily hold a seat while completing checkout.
5. Users can pay using a supported payment provider.
6. Users receive confirmation and tickets after successful payment.
7. Users can view their orders and ticket status.
8. Administrators can create events and manage ticket inventory.
3. Non-Functional Requirements
- Scalability: Handle high traffic during popular ticket sales.
- Availability: Keep browsing and ticket purchasing available despite individual component failures.
- Performance: Return browsing responses quickly and minimize checkout delays.
- Consistency: Never confirm two valid purchases for the same seat.
- Security: Protect user information, payment references, and ticket access.
- Reliability: Support payment retries and recovery from failed requests.
- Auditability: Maintain a traceable record of holds, orders, and payment outcomes.
4. Traffic and Capacity Estimates
These figures are planning assumptions, not measured production traffic.
Normal Traffic
Assume:
- 50,000 visitors per day.
- Each visitor views 10 pages.
- One day has 86,400 seconds.
Daily page views:
50,000 × 10 = 500,000 page views/day.
Average page-view rate:
500,000 ÷ 86,400 ≈ 5.8 page views per second.
Actual traffic will vary throughout the day, so average traffic alone is not enough for capacity planning.
Peak Ticket Sale
Assume:
- 200,000 buyers attempt to purchase tickets during a 10-minute sale.
- The sale lasts 600 seconds.
- A peak surge of 1,000 participants per second is used as a stress-testing target.
- The event has 20,000 seats.
Average buyer arrival rate during the sale:
200,000 ÷ 600 ≈ 333 buyers per second.
A reasonable initial stress-test target is 1,000 participants per second, approximately three times the calculated average arrival rate. This is a design target, not a guaranteed maximum capacity.
Demand-to-seat ratio:
200,000 buyers ÷ 20,000 seats = 10 buyers per seat.
Demand is ten times available inventory. The system must handle rejected attempts gracefully and must not oversell seats.
Capacity Strategy
- Use a CDN to serve static files and cache public event information.
- Run multiple stateless application instances behind a load balancer.
- Cache event listings and seat-map display data, but never trust cached availability to authorize a sale.
- Use database transactions and constraints to protect inventory.
- Apply rate limits and admission controls during peak sales.
- Use queues for non-critical work, such as sending confirmation emails.
- Load-test checkout separately from ordinary browsing.
5. API Specification
All endpoints use HTTPS and JSON. Authenticated endpoints require a valid user session or access token.
Method	Endpoint	Purpose
GET	/api/events	List and search events
GET	/api/events/{eventId}	Retrieve event details
GET	/api/events/{eventId}/seats	Display seat information and indicative availability
POST	/api/holds	Temporarily hold a seat; does not create an order
GET	/api/holds/{holdId}	Retrieve hold status and expiry
DELETE	/api/holds/{holdId}	Release an active hold
POST	/api/orders	Create a pending order from a valid hold
GET	/api/orders/{orderId}	Retrieve order status
POST	/api/payments	Initiate payment for a pending order
POST	/api/payments/webhook	Receive verified payment-provider status updates
GET	/api/tickets/{ticketId}	Retrieve a purchased ticket


Example: Hold a Seat
Request:
POST /api/holds
Authorization: Bearer <access-token>
Idempotency-Key: 7d3d9e4a-unique-request-id
Content-Type: application/json
{
  "event_id": 101,
  "seat_id": 502
}
Successful response:
{
  "hold_id": "hold-abc123",
  "event_id": 101,
  "seat_id": 502,
  "status": "HELD",
  "expires_at": "2026-10-18T15:10:00Z"
}
If another customer already holds or purchased the seat, the API returns 409 Conflict.
The idempotency key identifies retries of the same logical request. The service stores the key and result in an idempotency store (or equivalent durable mechanism), so a network retry returns the original result rather than creating another hold. The hold identifier is a separate identifier from the order identifier.
API Error Handling
- 400 Bad Request: Invalid input.
- 401 Unauthorized: Missing or invalid authentication.
- 403 Forbidden: The user is not permitted to perform the action.
- 404 Not Found: The requested event, seat, hold, or order does not exist.
- 409 Conflict: The seat is unavailable, the hold has expired, or the request conflicts with the current state.
- 429 Too Many Requests: Rate limit exceeded.
- 500 Internal Server Error: Unexpected server failure.
6. Database Design
PostgreSQL is suitable because seat allocation and order creation require reliable transactions and uniqueness constraints. The design has four core tables: users, events, seats, and orders. A separate payment table can be added in a production extension.
Table 1: users
Stores customer account information.
Column	Type	Constraints
user_id	BIGINT	Primary key
full_name	VARCHAR(150)	NOT NULL
email	VARCHAR(255)	UNIQUE, NOT NULL
password_hash	TEXT	NOT NULL
created_at	TIMESTAMPTZ	NOT NULL, default current time


Passwords must be stored as secure password hashes, never as plaintext.
Table 2: events
Stores event information.
Column	Type	Constraints
event_id	BIGINT	Primary key
title	VARCHAR(200)	NOT NULL
venue	VARCHAR(200)	NOT NULL
starts_at	TIMESTAMPTZ	NOT NULL
sales_open_at	TIMESTAMPTZ	NOT NULL
sales_close_at	TIMESTAMPTZ	NOT NULL
created_at	TIMESTAMPTZ	NOT NULL, default current time


An event has many seats. Its sale window controls when customers can attempt to reserve inventory.
Table 3: seats
Stores the inventory for each event.
Column	Type	Constraints
seat_id	BIGINT	Primary key
event_id	BIGINT	Foreign key to events.event_id
seat_label	VARCHAR(30)	NOT NULL
price	NUMERIC(10,2)	NOT NULL, CHECK price >= 0
status	VARCHAR(20)	NOT NULL; AVAILABLE, HELD, or SOLD
held_by	BIGINT	Nullable foreign key to users.user_id
hold_expires_at	TIMESTAMPTZ	Nullable
updated_at	TIMESTAMPTZ	NOT NULL, default current time


A unique constraint on (event_id, seat_label) prevents duplicate seat labels within an event. The seat row is the authoritative source for current inventory status. It does not store order_id; this avoids a circular relationship between seats and orders.
Table 4: orders
Stores checkout and purchase records.
Column	Type	Constraints
order_id	BIGINT	Primary key
user_id	BIGINT	Foreign key to users.user_id
event_id	BIGINT	Foreign key to events.event_id
seat_id	BIGINT	Foreign key to seats.seat_id
amount	NUMERIC(10,2)	NOT NULL, CHECK amount >= 0
status	VARCHAR(20)	PENDING, PAID, FAILED, or CANCELLED
idempotency_key	VARCHAR(255)	UNIQUE, NOT NULL
created_at	TIMESTAMPTZ	NOT NULL, default current time


A seat may have historical failed or cancelled orders, so seat_id is not globally unique across all order history. Instead, a partial unique index allows at most one active (PENDING or PAID) order per seat. A paid order remains active because the seat has been sold; a failed or cancelled order no longer blocks a new order.
Relationships
- One user can create many orders.
- One event can contain many seats and have many orders.
- Each order belongs to one user and one event and references one seat.
- A seat can be held by one user at a time.
- A sold seat is represented by seats.status = 'SOLD' and its corresponding paid order.
- Failed and cancelled orders are retained for audit history but do not block a future purchase.
Example PostgreSQL Schema
The following SQL is ordered so referenced tables exist before their foreign keys are created. IDs are generated by the database.
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

CREATE TABLE seats (
    seat_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(event_id),
    seat_label VARCHAR(30) NOT NULL,
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN ('AVAILABLE', 'HELD', 'SOLD')),
    held_by BIGINT REFERENCES users(user_id),
    hold_expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, seat_label),
    CHECK (
        (status = 'AVAILABLE' AND held_by IS NULL AND hold_expires_at IS NULL)
        OR
        (status = 'HELD' AND held_by IS NOT NULL AND hold_expires_at IS NOT NULL)
        OR
        (status = 'SOLD' AND held_by IS NULL AND hold_expires_at IS NULL)
    )
);

CREATE TABLE orders (
    order_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    event_id BIGINT NOT NULL REFERENCES events(event_id),
    seat_id BIGINT NOT NULL REFERENCES seats(seat_id),
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    status VARCHAR(20) NOT NULL
        CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'CANCELLED')),
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active order can exist for a seat at a time.
-- Historical FAILED/CANCELLED orders do not block a new checkout.
CREATE UNIQUE INDEX one_active_order_per_seat
    ON orders(seat_id)
    WHERE status IN ('PENDING', 'PAID');

CREATE INDEX seats_event_status_idx
    ON seats(event_id, status);

CREATE INDEX orders_user_created_idx
    ON orders(user_id, created_at DESC);
The CHECK constraint keeps seat ownership fields consistent with the seat status. The partial unique index is the final database safeguard against concurrent active orders for the same seat. Application transactions must still keep seat and order status changes synchronized.
7. Preventing Double-Booking
The database is the authority for seat ownership. A cached seat map may be stale, so the server must recheck availability in the primary database when a user requests a hold.
Flow A: POST /api/holds — Hold Only
The hold endpoint temporarily claims a seat; it does not create an order. It performs an atomic conditional update:
UPDATE seats
SET status = 'HELD',
    held_by = $1,
    hold_expires_at = NOW() + INTERVAL '10 minutes',
    updated_at = NOW()
WHERE seat_id = $2
  AND (
      status = 'AVAILABLE'
      OR (status = 'HELD' AND hold_expires_at <= NOW())
  )
RETURNING seat_id, event_id, price, hold_expires_at;
Parameters:
- $1: authenticated user's ID.
- $2: requested seat ID.
If exactly one row is returned, the hold was acquired. If no row is returned, the seat is held by someone else, has been sold, or does not exist; return an appropriate conflict/not-found response.
The update is atomic under concurrent access. Two buyers attempting to hold the same available seat cannot both successfully update that row.
Handling an Expired Hold Safely
An expired hold may have an older pending order. Before a reclaimed seat is used for a new order, the order service must reconcile the previous pending order. In a short transaction, it locks the seat row, checks the current state and expiry, and marks the old pending order CANCELLED (or FAILED) before allowing a new pending order. It must not cancel an order while a payment may still succeed without first checking or reconciling that payment. A late successful payment must be reconciled and, if the seat has already been sold to someone else, refunded rather than used to issue a second ticket.
A background expiry worker can help with cleanup, but correctness must not depend on the worker running exactly on time. The hold endpoint and order endpoint must check expiry in the database.
Flow B: POST /api/orders — Create an Order From a Valid Hold
The order endpoint creates the pending order after a valid hold exists. The seat hold and order creation are separate API actions, so the database logic must match that API contract.
The order service performs the following in one short transaction:
1. Begin a transaction.
2. Lock the seat row using SELECT ... FOR UPDATE.
3. Verify the seat is HELD, is held by the authenticated user, and has hold_expires_at > NOW().
4. Reconcile any prior expired pending order, if applicable.
5. Insert a PENDING order using the seat's current event and price from the database.
6. Commit only if every check and insert succeeds; otherwise roll back.
Illustrative SQL (the application must perform the checks and branch based on returned rows):
BEGIN;

SELECT seat_id, event_id, price, status, held_by, hold_expires_at
FROM seats
WHERE seat_id = $1
FOR UPDATE;
The application verifies that the returned row belongs to the requested event, is HELD, has held_by = $2, and has hold_expires_at > NOW(). If not, it rolls back and returns 409 Conflict.
After any expired prior order has been safely reconciled, insert the new order using values read from the locked seat row:
INSERT INTO orders (
    user_id, event_id, seat_id, amount, status, idempotency_key
)
VALUES ($2, $3, $1, $4, 'PENDING', $5)
RETURNING order_id;
Here $1 is the seat ID, $2 is the authenticated user ID, $3 and $4 are the event ID and price read from the locked seat row, and $5 is the unique order-creation idempotency key. The application must return the existing order for a retry with the same idempotency key, rather than creating another one.
COMMIT;
COMMIT occurs only if the validation and insert succeed. On any error, execute ROLLBACK. The partial unique index one_active_order_per_seat is an additional safeguard if concurrent requests race to create active orders.
Flow C: Payment and Final Sale
Do not call the external payment provider while holding a database transaction open.
1. Create a short-lived seat hold.
2. Create a pending order from that valid hold in a separate short transaction.
3. Commit the order transaction.
4. Initiate payment with the provider using an idempotency key.
5. Verify the provider's webhook signature or query the provider's trusted status endpoint.
6. In a new database transaction, lock the order and seat and verify the order is still PENDING, the seat is still held for the same user, and the hold has not expired.
7. Mark the order PAID and seat SOLD in the same transaction.
8. If payment fails, mark the order FAILED and release the seat when safe. If the hold has expired or the seat has been reassigned, reconcile the payment and refund if necessary; never issue a second ticket for the same seat.
The finalization operation must be idempotent: repeated notifications for an already-finalized order must return its existing result without issuing another ticket.
Illustrative transaction:
BEGIN;

-- Lock the order first; the application obtains its seat_id and user_id.
SELECT order_id, seat_id, user_id, status
FROM orders
WHERE order_id = $1
FOR UPDATE;

-- Then lock the corresponding seat.
SELECT seat_id, status, held_by, hold_expires_at
FROM seats
WHERE seat_id = $2
FOR UPDATE;
The application verifies that the order is PENDING, the seat is HELD, held_by matches the order's user, and hold_expires_at > NOW(). If any condition fails, it rolls back and initiates payment reconciliation rather than marking the order paid.
If all checks pass, run both updates:
UPDATE orders
SET status = 'PAID'
WHERE order_id = $1
  AND status = 'PENDING'
RETURNING order_id;

UPDATE seats
SET status = 'SOLD',
    held_by = NULL,
    hold_expires_at = NULL,
    updated_at = NOW()
WHERE seat_id = $2
  AND status = 'HELD'
  AND held_by = $3
  AND hold_expires_at > NOW()
RETURNING seat_id;
The application must confirm that both statements returned exactly one row. If either returns no row, roll back the entire transaction. Commit only when both updates succeed:
COMMIT;
Otherwise:
ROLLBACK;
The order and seat changes therefore commit together or not at all. The application must also ensure $2 is the seat belonging to $1, using the locked order record rather than trusting a client-supplied seat ID.
Releasing a Hold or Handling Failed Payment
For a user-initiated release or a safe expiry cleanup, lock the seat and its pending order in a transaction. Confirm the hold belongs to that user and that no payment is still unresolved. Mark any associated pending order CANCELLED or FAILED, then set the seat to AVAILABLE, clear held_by and hold_expires_at, and commit. If payment is in progress or its result is unknown, reconcile with the provider first; do not free the seat on the assumption that payment failed.
Why This Prevents Double-Booking
- Atomic conditional updates prevent two users from holding the same available seat at once.
- Row locks serialize order creation and finalization for the same seat.
- The partial unique index permits only one active order per seat while allowing historical failed/cancelled attempts.
- Expiry checks prevent abandoned holds from reserving inventory indefinitely.
- Idempotency keys make retries safe.
- Seat and order state changes commit together.
- Payment reconciliation handles late, duplicated, or conflicting payment notifications.
8. Architecture Diagram
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
Architecture Components
CDN and WAF: Deliver static content and help protect the platform from abusive traffic.
Load balancer and API gateway: Distribute requests and enforce common access, validation, and rate-limiting policies.
Event service: Handles event listings and event details. Public event data can be cached.
Seat service: Reads seat-map information and performs authoritative seat holds using database transactions and conditional updates.
Order service: Creates pending orders from valid holds, tracks order status, and coordinates checkout.
PostgreSQL: Stores users, events, seats, and orders. The primary database handles authoritative writes. Read replicas can serve suitable browsing queries.
Payment service: Initiates payment requests, verifies provider notifications, and coordinates finalization or reconciliation.
Message queue and workers: Handle non-critical asynchronous work, such as sending email confirmations and preparing ticket notifications after a purchase is committed.
Handling Sale Spikes
- Serve public event pages and static assets through the CDN.
- Use caching for event information, but never use cached availability to authorize a seat sale.
- Apply rate limiting and queue or admission controls to protect checkout services.
- Scale stateless services horizontally.
- Monitor database connection pools and transaction latency.
- Load-test concurrent attempts for the same seat and large numbers of distinct seats.
- Keep transactions short to reduce lock contention.
9. Architectural Trade-Offs
Trade-Off 1: Database Consistency vs. Read Performance
Read replicas improve throughput for browsing but can lag behind the primary database. A customer might briefly see stale availability after another customer reserves a seat.
Decision: Use replicas and caches for event browsing where brief staleness is acceptable. Use the primary database for seat holds and final sale transitions. Never rely on a read replica to make the final booking decision.
Trade-Off 2: Temporary Holds vs. Immediate Purchase
Temporary holds give customers time to complete checkout and reduce simultaneous contention. However, they temporarily make seats unavailable to other customers, and abandoned holds require expiration and cleanup.
Decision: Use short-lived holds with explicit expiry timestamps. Check expiry during hold acquisition, order creation, and payment finalization. A background job can clean up expired records, but it is not the sole correctness mechanism.
Trade-Off 3: Synchronous vs. Asynchronous Work
Sending emails and preparing notifications synchronously increases checkout latency. Asynchronous processing improves responsiveness but introduces queue delays and retry complexity.
Decision: Commit the purchase state first, then queue notifications. A durable outbox or equivalent reliable event-publishing mechanism can prevent notification jobs from being lost between a database commit and message publication.
Trade-Off 4: Strict Inventory Guarantees vs. Maximum Throughput
Locking and updating seat rows adds database contention during a popular sale. However, allowing concurrent purchases without authoritative inventory control risks overselling.
Decision: Prioritize correctness for seat allocation. Improve throughput with indexing, short transactions, admission controls, and horizontal scaling of stateless services rather than weakening inventory guarantees.
Trade-Off 5: Precomputed Seat Maps vs. Live Availability
Caching seat maps makes browsing faster, but cached availability can become outdated quickly during a sale.
Decision: Cache the display representation where useful, label availability as indicative when necessary, and always perform a fresh atomic database operation when a customer requests a hold.
10. Monitoring and Failure Recovery
Risk	Mitigation	Monitoring
Double-booking attempts	Conditional updates, row locks, partial unique index, transactions	Booking conflicts and integrity checks
Traffic spikes	Rate limits, admission control, horizontal scaling	Requests per second and latency
Database overload	Indexes, short transactions, connection pooling	CPU, connections, lock waits
Payment webhook retries	Signature verification, idempotent processing, reconciliation	Duplicate notifications and failures
Expired holds	Expiry checks and cleanup jobs	Number and age of expired holds
Late payment success	Provider reconciliation and refund workflow	Payments received after hold expiry
Queue backlog	Scale workers and retry safely	Queue depth and oldest message age
Stale replicas	Route critical reads to primary	Replication lag
Notification failure	Retry policy and dead-letter queue	Delivery failure rate


Conclusion
TicketHub separates browsing, seat allocation, order management, payment processing, and background notifications so each component can scale according to its workload.
The core protection against double-booking is an atomic conditional seat hold, row-locked order creation and finalization, and a partial unique index that permits only one active order per seat while preserving failed and cancelled orders for audit history. The hold API and order API have separate, consistent responsibilities. Expired holds are reconciled with existing orders, and uncertain or late payments are checked with the provider before inventory is released or a ticket is issued.
Capacity planning starts with approximately 5.8 normal page views per second, 333 buyer arrivals per second during a ten-minute sale, and a 1,000-participant-per-second stress-test target. The architecture should be validated through load testing, especially for concurrent attempts to reserve the same seat.