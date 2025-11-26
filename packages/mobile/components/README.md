# Components

Reusable React Native components for the Glass mobile app.

## Structure

```
components/
├── ui/              # Basic UI components (buttons, inputs, etc.)
├── features/        # Feature-specific components
└── layouts/         # Layout components (wrappers, containers)
```

## Usage

```typescript
import { Button } from '@/components/ui/button';
import { PartnerCard } from '@/components/features/partner-card';
```

## Creating New Components

### Basic Component Template

```typescript
import { View, Text, StyleSheet } from 'react-native';

interface MyComponentProps {
  title: string;
  onPress?: () => void;
}

export function MyComponent({ title, onPress }: MyComponentProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
});
```

## Guidelines

1. **Naming**: Use PascalCase for component files and exports
2. **Props**: Define TypeScript interfaces for props
3. **Styles**: Use StyleSheet.create for performance
4. **Accessibility**: Include accessibility props when relevant
5. **Reusability**: Keep components focused and reusable

## Common Patterns

### Platform-Specific Code

```typescript
import { Platform } from 'react-native';

const styles = StyleSheet.create({
  text: {
    ...Platform.select({
      ios: { fontFamily: 'System' },
      android: { fontFamily: 'Roboto' },
    }),
  },
});
```

### Responsive Design

```typescript
import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    width: width > 768 ? '50%' : '100%',
  },
});
```

