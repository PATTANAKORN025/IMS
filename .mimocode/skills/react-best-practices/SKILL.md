---
name: react-best-practices
description: React development best practices - components, hooks, state management, and performance optimization
---

# React Best Practices

Guide for writing clean, maintainable, and performant React applications.

## When to Use

- Creating new React components
- Refactoring existing components
- Implementing state management
- Optimizing performance

## Component Guidelines

### 1. Component Structure

```jsx
// Good: Single responsibility
function UserAvatar({ user }) {
  return (
    <img 
      src={user.avatarUrl} 
      alt={`${user.name}'s avatar`}
      className="avatar"
    />
  );
}

// Good: Container/Presentational pattern
function UserCard({ userId }) {
  const user = useUser(userId);
  
  return (
    <div className="card">
      <UserAvatar user={user} />
      <UserInfo user={user} />
    </div>
  );
}
```

### 2. Hooks Best Practices

```jsx
// Good: Custom hooks for reusable logic
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
}

// Good: Use useCallback for stable references
const handleSubmit = useCallback((data) => {
  onSubmit(data);
}, [onSubmit]);

// Good: Use useMemo for expensive computations
const sortedItems = useMemo(() => {
  return items.sort((a, b) => a.name.localeCompare(b.name));
}, [items]);
```

### 3. State Management

```jsx
// Local state: useState
const [count, setCount] = useState(0);

// Complex state: useReducer
function reducer(state, action) {
  switch (action.type) {
    case 'increment':
      return { count: state.count + 1 };
    case 'decrement':
      return { count: state.count - 1 };
    default:
      return state;
  }
}

// Server state: React Query / SWR
const { data, isLoading, error } = useQuery({
  queryKey: ['users'],
  queryFn: fetchUsers,
});
```

### 4. Performance Optimization

```jsx
// Lazy loading components
const HeavyComponent = lazy(() => import('./HeavyComponent'));

// Virtualization for long lists
import { FixedSizeList } from 'react-window';

function VirtualList({ items }) {
  return (
    <FixedSizeList
      height={500}
      itemCount={items.length}
      itemSize={50}
    >
      {({ index, style }) => (
        <div style={style}>
          {items[index].name}
        </div>
      )}
    </FixedSizeList>
  );
}
```

### 5. Error Handling

```jsx
// Error boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    logErrorToService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <h1>Something went wrong.</h1>;
    }
    return this.props.children;
  }
}
```

### 6. Testing

```jsx
// Unit tests
import { render, screen } from '@testing-library/react';
import UserAvatar from './UserAvatar';

test('renders user avatar', () => {
  const user = { name: 'John', avatarUrl: '/avatar.jpg' };
  render(<UserAvatar user={user} />);
  
  const img = screen.getByRole('img');
  expect(img).toHaveAttribute('alt', "John's avatar");
});
```

## Code Style

1. **Use TypeScript** for type safety
2. **Keep components small**: < 200 lines
3. **Extract custom hooks** for reusable logic
4. **Use prop types** or TypeScript interfaces
5. **Avoid inline styles** - use CSS modules or styled-components
6. **Name components descriptively**: `UserAvatar` not `Avatar1`
