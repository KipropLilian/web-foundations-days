
# Day 8 Reflection

The most difficult concept in this course was understanding how to design a system that remains correct when many users make requests at the same time. It was relatively easy to describe an application that allows users to select seats, but harder to explain how the system could prevent two customers from buying the same seat during a popular ticket sale. I overcame this by connecting database concepts to the actual problem. Transactions, row locking, conditional updates, and unique constraints each serve a specific purpose. I also learned that a cache can improve speed but should not be trusted to make the final decision about seat ownership.

One part of my capstone that I would improve is the explanation of how the architecture behaves under pressure. I would make the request flow and failure-handling process clearer, particularly what happens when a payment succeeds but the confirmation is delayed. I would also add load-testing results instead of relying only on estimated traffic. This would help demonstrate whether the proposed performance targets are realistic.

Next, I plan to learn how to implement a real backend using Node.js and Express, connect it to PostgreSQL, and write automated tests for API endpoints. I also want to practise concurrent booking tests to verify that only one customer can hold a seat at a time. These skills will help me move from documenting system designs to building and testing reliable applications.
