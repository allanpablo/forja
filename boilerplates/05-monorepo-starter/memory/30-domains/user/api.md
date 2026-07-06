# User API Endpoints

## Public Endpoints

### Register User
```
POST /api/users/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "firstName": "John",
  "lastName": "Doe"
}

Response: 201 Created
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "user",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

### Login
```
POST /api/users/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "user": { ...UserResponse },
    "token": "eyJhbGc..."
  }
}
```

## Protected Endpoints (Requires JWT)

### Get User Profile
```
GET /api/users/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": { ...UserResponse }
}
```

### Update Profile
```
PUT /api/users/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName": "Smith"
}

Response: 200 OK
{
  "success": true,
  "data": { ...UserResponse }
}
```

## Admin-Only Endpoints

### List All Users
```
GET /api/users
Authorization: Bearer <admin_token>

Response: 200 OK
{
  "success": true,
  "data": {
    "users": [...],
    "total": 42,
    "page": 1
  }
}
```
