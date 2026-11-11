import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import hu from '../../i18n/hu';
import { colors, layout, typography } from '../../theme/tokens';

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
          // Wide desktop browsers: keep the tab bar aligned with the centred
          // phone-width column instead of stretching across the monitor.
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
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
        name="booking"
        options={{
          title: hu.tabs.booking,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={size}
              color={iconColor(color)}
            />
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