import {
  IconDarkOutline16, IconLightOutline16,
} from '@daoai/dao-client-ui-primitives'
import type { ObservableSnapshot } from '@daoai/dao-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@daoai/dao-client-ui-slots'
import type { ThemeSnapshot } from './index.ts'
import type {} from '@daoai/dao-client-ui-conversation/client'
import css from './ThemeToggle.module.css'

/** Theme state and action supplied by the ui-theme registration. */
export interface ThemeToggleInjected {
  /** Current resolved theme snapshot. */
  hooks: { theme: ObservableSnapshot<ThemeSnapshot> }
  /** Switch between the concrete light and dark preferences. */
  toggleTheme: () => void
}

/** Composed session-header theme-toggle props. */
export type ThemeToggleProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<'settings.theme'>
  & InjectFace<ThemeToggleInjected>

/** Render the compact light/dark action in the Session header. */
export function ThemeToggle({ useTheme, toggleTheme, t }: ThemeToggleProps) {
  const dark = useTheme(snapshot => snapshot.active.colorScheme === 'dark')
  const label = t(dark ? 'toggle.light' : 'toggle.dark')
  return (
    <button
      type="button"
      className={css.toggle}
      aria-label={label}
      aria-pressed={dark}
      onClick={toggleTheme}
    >
      <span className={css.icon} aria-hidden="true">
        {dark ? <IconLightOutline16 size={14} /> : <IconDarkOutline16 size={14} />}
      </span>
      <span className={css.label}>{t(dark ? 'appearance.light' : 'appearance.dark')}</span>
    </button>
  )
}
