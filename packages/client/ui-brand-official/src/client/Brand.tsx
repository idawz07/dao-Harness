import { DaoMark, DaoWordmark } from '@daoai/dao-client-ui-primitives'
import type { HeroBrandMarkOwnerProps } from '@daoai/dao-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@daoai/dao-client-ui-sidebar/client'
import css from './Brand.module.css'

type OfficialBrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

/**
 * Render the official mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the official convergence mark.
 */
export function OfficialBrandMark({ size, className }: OfficialBrandMarkProps) {
  const classes = className === undefined ? css.artwork : `${css.artwork} ${className}`
  return <DaoMark size={size} className={classes} />
}

/**
 * Render the official name artwork without its independently slotted mark.
 * @returns the official name wordmark.
 */
export function OfficialBrandName() {
  return <DaoWordmark includeMark={false} className={css.artwork} />
}
