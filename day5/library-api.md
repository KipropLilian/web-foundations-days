
# Library Books REST API

## Base URL

`https://api.example.com`

Resource: `/books`

### 1. List all books

- **Method:** GET
- **Path:** `/books`
- **Description:** Retrieves the collection of books.
- **Success status:** `200 OK`
- **Example request body:** None.

### 2. Get one book

- **Method:** GET
- **Path:** `/books/{id}`
- **Description:** Retrieves a book by its unique ID.
- **Success status:** `200 OK`
- **Example request body:** None.

### 3. Create a book

- **Method:** POST
- **Path:** `/books`
- **Description:** Creates a new book.
- **Example request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "publishedYear": 1958
}
```

- **Success status:** `201 Created`

### 4. Update a book

- **Method:** PUT
- **Path:** `/books/{id}`
- **Description:** Replaces the details of an existing book.
- **Example request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "publishedYear": 1958
}
```

- **Success status:** `200 OK`

### 5. Delete a book

- **Method:** DELETE
- **Path:** `/books/{id}`
- **Description:** Deletes a book by its unique ID.
- **Success status:** `204 No Content`

### 6. List books by author

- **Method:** GET
- **Path:** `/books?author=Chinua%20Achebe`
- **Description:** Retrieves books matching the specified author query parameter.
- **Success status:** `200 OK`
- **Example request body:** None.

## Error Responses

### 400 Bad Request

Returned when the request contains invalid data, such as creating a book without a required title.

Example response:

```json
{
  "error": "Bad Request",
  "message": "The title field is required."
}
```

### 404 Not Found

Returned when a requested book ID does not exist.

Example response:

```json
{
  "error": "Not Found",
  "message": "No book was found with the requested ID."
}
```
