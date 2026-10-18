
# TicketHub: System Design

## 1. Context and Requirements

### Context

TicketHub is an online ticketing platform where users discover events, view available seats, reserve seats, pay for tickets, and access their purchased tickets. The main engineering challenge is handling sudden demand without selling the same seat to multiple people.

### Functional requirements

1. Users can register, log in, and view their accounts.
2. Users can browse, search, and view concert and event details.
3. Users can view a venue's seats and their availability.
4. Users can temporarily hold available seats while completing checkout.
5. Users can pay for an order and receive confirmation.
6. Users can view their confirmed orders and tickets.
7. Expired holds and failed or cancelled orders release seats for other customers.
8. The system records orders and payment outcomes for auditing and support.

### Non-functional requirements

- **Speed:** Event pages should normally load within 2 seconds at the 95th percentile. Seat availability and hold requests should normally respond within 500 ms at the 95th percentile, excluding external payment-provider delays.
- **Correctness:** A seat must never be sold to more than one customer. The database, not the browser or cache, is the authority for seat ownership.
- **Availability:** Browsing should remain available during high demand. If booking or payment services fail, the system must fail safely rather than confirm an unreserved seat.
- **Fairness:** Customers entering a high-demand sale should receive a queue position or time-limited access token. The system should process customers in queue order as far as practical and apply rate limits to prevent automated abuse.
- **Security:** Authentication, authorization, encrypted connections, input validation, and payment-provider verification are required. The system must not store raw card details.
- **Reliability:** Payment callbacks must be idempotent, so processing the same callback more than once does not create duplicate orders or charges.
- **Scalability:** The system must support a sudden increase in browsing and booking traffic without allowing overselling.
- **Consistency:** Seat holds, order confirmation, and ticket allocation must use transactional database operations.

### Goals and non-goals

The goal is a reliable ticketing service with fair access, correct seat allocation, and safe payment processing.

The initial design does not attempt to build a payment network, manufacture tickets for physical venues, or support multiple currencies and countries in its first release.

## 2. Traffic Estimates and Scale

### Normal day

Given:
- 2 million registered users.
- 50,000 daily visitors.
- Each visitor views 10 pages.
- 5,000 tickets sold per day.

Assume a day has 86,400 seconds.

**Page views:**

50,000 visitors × 10 pages = 500,000 page views/day.

Average page-view rate:

500,000 ÷ 86,400 ≈ 5.8 page views/second.

**Ticket sales:**

5,000 tickets ÷ 86,400 ≈ 0.058 tickets/second, or approximately 3.5 tickets/minute on average.

These averages hide busy periods, so the system must be designed for higher short-term traffic.

### Popular concert sale

Given:
- 200,000 people try to buy tickets within 10 minutes.
- The concert has 20,000 seats.

**Average arrival rate:**

200,000 ÷ 600 seconds ≈ 333 people/second.

For planning, assume the busiest period reaches three times this average:

333 × 3 ≈ 1,000 people/second.

This 1,000-per-second figure is a planning assumption, not a measured result. The actual peak must be validated through load testing.

**Demand compared with supply:**

200,000 potential buyers ÷ 20,000 seats = 10 potential buyers per seat.

Only 10% of the interested crowd can obtain a seat if everyone attempts to purchase one seat. The remaining customers need a clear sold-out message or an optional waitlist.

### Comparison

| Metric | Normal day | Popular sale |
|---|---:|---:|
| Visitors or potential buyers | 50,000/day | 200,000 in 10 minutes |
| Relevant average rate | 5.8 page views/sec | 333 sale participants/sec |
| Planning peak | Must be measured | About 1,000 participants/sec |
| Ticket supply | 5,000 sold/day | 20,000 seats |
| Main risk | Ordinary application load | Contention, bots, overselling, overload |

The sale's average arrival rate is about 57 times the normal page-view rate, although these figures measure different types of requests. Booking traffic can generate several requests per buyer, so request-level load testing is essential.

The architecture should use a waiting room, caching for public event information, horizontally scaled application servers, and a transactional database for seat allocation.

## 3. API Design

Base URL: `/api/v1`

| Method and endpoint | Purpose | Successful response |
|---|---|---|
| `GET /events` | Browse and search events | `200 OK` |
| `GET /events/{eventId}` | View event details | `200 OK` |
| `GET /events/{eventId}/seats` | View seat availability | `200 OK` |
| `POST /seat-holds` | Temporarily hold a seat | `201 Created` |
| `DELETE /seat-holds/{holdId}` | Release a hold | `204 No Content` |
| `POST /orders` | Create an order from a valid hold | `201 Created` |
| `POST /orders/{orderId}/payments` | Initiate payment | `202 Accepted` |
| `POST /payments/webhook` | Receive verified payment updates | `200 OK` |
| `GET /me/tickets` | View the user's confirmed tickets | `200 OK` |
| `GET /orders/{orderId}` | Check order and payment status | `200 OK` |

### Example: create a seat hold

Request:

`POST /api/v1/seat-holds`

```json
{
  "eventId": 42,
  "seatId": 105,
  "idempotencyKey": "hold-request-unique-123"
}
```

Successful response:

```json
{
  "holdId": "hold-789",
  "eventId": 42,
  "seatId": 105,
  "status": "held",
  "expiresAt": "2026-11-01T12:05:00Z"
}
```

A hold might expire after five minutes. The duration should be configurable and communicated clearly to customers.

If the seat is already sold or actively held, return `409 Conflict`. Invalid requests return `400 Bad Request`; unauthenticated requests return `401 Unauthorized`; missing resources return `404 Not Found`; and rate-limited clients receive `429 Too Many Requests`.

### Example: payment

The client initiates payment against an order. The payment provider processes it and sends a verified callback. The backend confirms the order only after validating the payment result and confirming that the seat hold is still valid.

The client must not be allowed to mark an order as paid simply by sending a successful-looking response.

## 4. Data Model

The initial relational database contains six tables: `users`, `events`, `seats`, `orders`, `order_items`, and `payments`.

### Tables and relationships

**users**
- `id`: primary key.
- `name`: required text.
- `email`: required and unique.
- `created_at`: timestamp.

**events**
- `id`: primary key.
- `title`: required text.
- `venue`: required text.
- `starts_at`: timestamp.
- `status`: for example, draft, published, or cancelled.

**seats**
- `id`: primary key.
- `event_id`: foreign key referencing `events.id`.
- `seat_label`: seat identifier such as `A-12`.
- `status`: available, held, or sold.
- `held_by_user_id`: nullable foreign key referencing `users.id`.
- `hold_expires_at`: nullable timestamp.

Constraint: `UNIQUE(event_id, seat_label)` ensures that the same physical seat is not entered twice for one event.

**orders**
- `id`: primary key.
- `user_id`: foreign key referencing `users.id`.
- `status`: pending, confirmed, failed, or cancelled.
- `total_amount`: required decimal.
- `currency`: required text.
- `created_at`: timestamp.

**order_items**
- `id`: primary key.
- `order_id`: foreign key referencing `orders.id`.
- `seat_id`: foreign key referencing `seats.id`.
- `price`: required decimal recording the price at purchase time.
- Constraint: `UNIQUE(order_id, seat_id)` prevents the same seat from being added twice to one order.

**payments**
- `id`: primary key.
- `order_id`: foreign key referencing `orders.id`.
- `provider_reference`: unique payment-provider reference.
- `amount`: required decimal.
- `status`: pending, successful, or failed.
- `created_at`: timestamp.

### Relationships

- One user can place many orders.
- One event has many seats.
- One order contains one or more order items.
- Each order item refers to a seat.
- One order can have multiple payment attempts, but each provider reference must be unique.

Indexes should support event searches, seat lookup by event, and order lookup by user. A production implementation should also use database constraints to prevent invalid status transitions and negative prices.

### Preventing two people from buying the same seat

The database is the source of truth. The application must never rely only on a seat appearing available in a cached page.

1. A customer requests a hold.
2. The server begins a short database transaction and locks the relevant seat row, or performs an atomic conditional update.
3. The hold succeeds only if the seat is available or its previous hold has expired.
4. The transaction records the new owner and expiry time, then commits. If another customer tries to hold the same seat concurrently, that request must fail because the first request already changed the authoritative row.
5. During checkout, the server verifies that the hold belongs to the customer and has not expired.
6. After verified payment, another transaction checks the valid hold and changes the seat to `sold` while confirming the order. Both changes succeed together or neither does.
7. An expiry worker releases abandoned holds. Its update must check the hold's current owner or version so it cannot release a newer customer's hold.

A unique constraint on `(event_id, seat_label)` prevents duplicate seat records. Row locking or atomic conditional updates prevent concurrent holds, while transactions keep seat status and order confirmation consistent.

Payment can take several seconds, so the database transaction should not remain open while waiting for the external payment provider. Instead, persist the temporary hold, initiate payment, and then validate the hold again when processing the verified result. Idempotency keys and unique payment references prevent duplicate processing.

## 5. High-Level Architecture

```text
                 Customers
                     |
             DNS / CDN / WAF
                     |
            Virtual Waiting Room
                     |
               Load Balancer
                     |
           +---------+---------+
           |                   |
       App Server 1        App Server 2
           |                   |
           +---------+---------+
                     |
          +----------+-----------+
          |          |           |
       Cache     Booking API   Queue
          |          |           |
    Event details    |       Background workers
                     |
              Primary Database
              /              \
       Read Replicas      Backups
                     |
             Payment Provider
                     |
            Verified Webhook
                     |
               Booking API
```

### Component responsibilities

- **DNS/CDN:** Directs customers to the service and caches suitable public assets and event information.
- **WAF and rate limiter:** Blocks suspicious traffic and limits abusive requests.
- **Virtual waiting room:** Admits sale participants at a controlled rate, assigns queue positions or access tokens, and reduces overload. Queue rules should be transparent and consistently enforced.
- **Load balancer:** Distributes requests across healthy application servers.
- **Application servers:** Handle authentication, event browsing, booking rules, and order requests. They are stateless so another server can handle a customer's next request.
- **Cache:** Speeds up public event details and other frequently read information. It must not independently decide whether a seat can be sold.
- **Booking API:** Performs authoritative hold and confirmation operations using the database.
- **Primary database:** Stores seat ownership, holds, orders, and payments. Transactions and constraints protect correctness.
- **Read replicas:** Handle suitable read-heavy queries, such as event browsing. Seat allocation decisions must use authoritative, sufficiently consistent database operations.
- **Queue and workers:** Send confirmations, expire holds, process notifications, and handle other retryable background tasks.
- **Payment provider:** Processes payments. Verified callbacks update the internal order state.
- **Backups and monitoring:** Support recovery and reveal slow responses, error spikes, database contention, queue delays, and payment failures.

### How the design survives the big sale

The waiting room limits how quickly requests enter the application. The CDN and cache absorb many repeated event-page reads. Multiple stateless servers provide horizontal scaling and allow unhealthy instances to be removed.

Read replicas handle suitable browsing queries, while the primary database serializes competing seat-allocation operations through locks or atomic updates. The queue moves non-critical tasks, such as email delivery, out of the booking response path.

The system should apply backpressure when the booking database approaches capacity, provide clear waiting and sold-out messages, and never report a ticket as confirmed until the database and payment state agree.

Before launch, load tests should simulate the estimated 1,000 participants per second and a higher safety margin. Monitoring should track latency, errors, queue length, database lock waits, successful bookings, payment failures, and overselling incidents.

## 6. Trade-offs and Alternatives

### Trade-off 1: Strict database correctness versus maximum throughput

Using transactions, row locks, and conditional updates protects seat ownership but creates contention when thousands of people compete for the same seats. This is a deliberate choice: selling one seat twice is worse than making some customers wait. The waiting room and short transactions help control the contention.

### Trade-off 2: Fair queueing versus immediate access

A waiting room smooths traffic and makes access more orderly, but users may wait even when application servers have spare capacity. Queue rules must be clear, abuse-resistant, and consistently applied. A randomised queue can be more practical than promising strict first-come-first-served ordering when network delays make exact arrival order difficult to establish.

### Trade-off 3: Caching versus freshness

Caching event pages reduces database traffic and improves response times, but cached seat availability may be outdated. Event information can be cached for longer; seat availability should be refreshed frequently and verified against the database before a hold is granted.

### Trade-off 4: Temporary holds versus unused inventory

Holds give customers time to pay but temporarily prevent others from buying those seats. Short, clearly communicated expiry periods and reliable cleanup reduce abandoned holds. Expiry must be checked in the authoritative database to avoid releasing a seat that has already been reassigned.

### Risks and open questions

- What is the expected ticket-hold duration and payment timeout?
- Does the venue provide an existing seat inventory system?
- What queue policy best balances fairness, bot resistance, and usability?
- What recovery procedure applies if payment succeeds but the callback is delayed?
- Load testing is needed to validate database capacity and the target latency.

## Conclusion

TicketHub prioritises correctness and fair access over accepting unlimited simultaneous booking requests. A waiting room controls demand, caches accelerate browsing, and transactional database operations protect seat allocation. The architecture should grow only when measured traffic and load tests justify each additional component.
