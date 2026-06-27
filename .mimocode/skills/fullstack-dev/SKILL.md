---
name: fullstack-dev
description: Full-stack development guidance - API design, database, authentication, and deployment
---

# Full-Stack Development

Comprehensive guide for building end-to-end web applications.

## When to Use

- Designing API endpoints
- Setting up database schemas
- Implementing authentication
- Configuring deployment pipelines
- Debugging cross-cutting concerns

## Architecture Patterns

### 1. API Design (REST)

```markdown
## Endpoint Structure

### Resources
- GET    /api/users          - List users
- GET    /api/users/:id      - Get user
- POST   /api/users          - Create user
- PUT    /api/users/:id      - Update user
- DELETE /api/users/:id      - Delete user

### Nested Resources
- GET    /api/users/:id/posts - List user's posts
```

### 2. Database Schema

```sql
-- Good: Normalized schema
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_published ON posts(published);
```

### 3. Authentication

```javascript
// JWT Authentication middleware
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.userId);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

### 4. Error Handling

```javascript
// Centralized error handling
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

// Error middleware
const errorHandler = (err, req, res, next) => {
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message
    });
  }
  
  // Programming errors - don't leak details
  console.error('ERROR:', err);
  return res.status(500).json({
    status: 'error',
    message: 'Something went wrong'
  });
};
```

### 5. Database Connections

```javascript
// Connection pooling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Use transactions for multi-step operations
async function transferFunds(fromId, toId, amount) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
      [amount, fromId]
    );
    await client.query(
      'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
      [amount, toId]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

### 6. Environment Configuration

```markdown
## .env Structure

### Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

### Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

### Services
REDIS_URL=redis://localhost:6379
SMTP_HOST=smtp.example.com
```

## Best Practices

1. **Validate input** at API boundaries
2. **Use environment variables** for secrets
3. **Implement rate limiting** to prevent abuse
4. **Add logging** for debugging and monitoring
5. **Write tests** for critical paths
6. **Use CI/CD** for automated deployments
