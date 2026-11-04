import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import hu from '../../i18n/hu';
import { colors, typography } from '../../theme/tokens';

/**
 * React Navigation hands the tab icon a ColorValue (string | number | opaque),
 * while Ionicons only accepts string/native color values.
 */
function iconColor(color: ColorValue | null | undefined): string {
  return typeof color === 'string' ? color : colors.textMuted;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: typography.sizes.xs,
          fontWeight: typography.weights.medium,
        },
        sceneStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: hu.tabs.workout,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'barbell' : 'barbell-outline'} size={size} color={iconColor(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="templates"
        options={{
          title: hu.tabs.templates,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'albums' : 'albums-outline'} size={size} color={iconColor(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: hu.tabs.history,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'time' : 'time-outline'} size={size} color={iconColor(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: hu.tabs.profile,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={iconColor(color)} />
          ),
        }}
      />
    </Tabs>
  );
}